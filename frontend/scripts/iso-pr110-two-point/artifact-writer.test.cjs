const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {createArtifactWriter, TOTAL_BYTES, RESERVE_BYTES, CASE_BYTES} = require('./artifact-writer.cjs');

function fakeFileSystem(output) {
  const entries = new Map(), descriptors = new Map(), calls = [];
  for (let directory = path.resolve(output); ; directory = path.dirname(directory)) {
    entries.set(directory, {kind: 'directory'});
    if (path.dirname(directory) === directory) break;
  }
  let descriptor = 10;
  const fault = code => Object.assign(new Error('Private operating-system detail must not leak'), {code});
  const lookup = file => { if (!entries.has(file)) throw fault('ENOENT'); return entries.get(file); };
  const controls = {};
  const fs = {
    lstatSync(file) {
      const entry = lookup(file);
      return {isDirectory: () => entry.kind === 'directory', isFile: () => entry.kind === 'file',
        isSymbolicLink: () => entry.kind === 'symlink', size: entry.kind === 'file' ? Buffer.byteLength(entry.text, 'utf8') : 0};
    },
    mkdirSync(directory) { calls.push(['mkdir', directory]); if (entries.has(directory)) throw fault('EEXIST'); entries.set(directory, {kind: 'directory'}); },
    readdirSync(directory) {
      assert.equal(lookup(directory).kind, 'directory');
      return [...entries.keys()].filter(file => file !== directory && path.dirname(file) === directory).map(file => path.basename(file));
    },
    openSync(file, flags, mode) {
      calls.push(['open', file, flags, mode]); assert.equal(flags, 'wx'); assert.equal(mode, 0o600);
      if (entries.has(file)) throw fault('EEXIST');
      assert.equal(lookup(path.dirname(file)).kind, 'directory');
      entries.set(file, {kind: 'file', text: ''}); descriptors.set(++descriptor, file); return descriptor;
    },
    writeFileSync(fd, text, options) {
      calls.push(['write', fd]); assert.equal(options.encoding, 'utf8');
      if (controls.failWrite) throw fault('EIO');
      entries.get(descriptors.get(fd)).text = text;
      controls.afterWrite?.(descriptors.get(fd));
    },
    closeSync(fd) { calls.push(['close', fd]); assert.equal(descriptors.has(fd), true); descriptors.delete(fd); },
    renameSync(from, to) {
      calls.push(['rename', from, to]); if (controls.failRename) throw fault('EIO');
      const entry = lookup(from); entries.delete(from); entries.set(to, entry);
    },
    unlinkSync(file) { calls.push(['unlink', file]); assert.equal(lookup(file).kind, 'file'); entries.delete(file); },
  };
  return {fs, entries, calls, controls, descriptors,
    put: (name, text, kind = 'file') => entries.set(path.join(output, name), {kind, text}),
    read: name => lookup(path.join(output, name)).text,
    names: () => fs.readdirSync(output).sort(),
  };
}

function fixture(options = {}) {
  const output = path.resolve('synthetic-artifact-output'), files = fakeFileSystem(output), errors = [];
  let clock = 0;
  const writer = createArtifactWriter(output, code => { errors.push(code); if (options.throwOnError) throw Error('Unsafe callback detail'); }, files.fs,
    {now: () => ++clock, totalBytes: 1024, reserveBytes: 128, ...options});
  return {output, files, writer, errors};
}

test('compact UTF8 entry limits count actual encoded bytes and preserve an earlier valid destination', () => {
  const h = fixture(), value = {name: '☃雪'};
  const text = JSON.stringify(value), bytes = Buffer.byteLength(text, 'utf8');
  assert.equal(bytes > text.length, true);
  h.files.put('case.json', 'retained');
  assert.equal(h.writer('case.json', value, {maxBytes: bytes - 1}), false);
  assert.equal(h.files.read('case.json'), 'retained'); assert.deepEqual(h.errors, ['artifact-entry-cap']);
  assert.equal(h.writer('case.json', value, {maxBytes: bytes}), true);
  assert.equal(h.files.read('case.json'), text); assert.equal(h.files.read('case.json').includes('\n'), false);
  assert.deepEqual(h.files.names(), ['case.json']); assert.equal(h.files.descriptors.size, 0);
  assert.deepEqual(h.writer.stats(), {count: 2, failed: 1, wall_ms: 2, includes_current_write: false});
});

test('replacement peak counts old destination plus staged bytes and all unrelated existing files', () => {
  const h = fixture({totalBytes: 100, reserveBytes: 20});
  h.files.put('case.json', 'x'.repeat(40)); h.files.put('jest.json', 'x'.repeat(10));
  assert.equal(h.writer('case.json', 'x'.repeat(29)), false); // 50 existing + 31 staged > 80.
  assert.equal(h.files.read('case.json').length, 40); assert.equal(h.files.calls.some(call => call[0] === 'open'), false);
  assert.equal(h.writer('case.json', 'x'.repeat(28)), true); // 50 existing + 30 staged = 80.
  assert.equal(Buffer.byteLength(h.files.read('case.json')), 30); assert.equal(h.files.read('jest.json').length, 10);
  assert.equal(h.writer.checkBudget(40), true); assert.equal(h.writer.checkBudget(41), false);
  assert.equal(h.writer.stats().count, 2); assert.equal(h.writer.stats().failed, 2);
});

test('ordinary files cannot spend the final reserve and final metadata still obeys total peak and entry caps', () => {
  const h = fixture({totalBytes: 100, reserveBytes: 20}); h.files.put('jest.json', 'x'.repeat(76));
  assert.equal(h.writer('live.json', 'x'.repeat(10)), false);
  assert.equal(h.writer('footer.json', 'x'.repeat(10), {final: true}), true);
  assert.equal(h.files.read('footer.json'), JSON.stringify('x'.repeat(10)));
  assert.equal(h.writer('footer.json', 'x'.repeat(18), {final: true}), false); // 76 + old12 + staged20 > 100.
  assert.equal(h.files.read('footer.json'), JSON.stringify('x'.repeat(10)));
  assert.equal(h.writer('another-footer.json', 'x'.repeat(19), {final: true}), false);
  assert.equal(h.errors.at(-1), 'artifact-entry-cap');
});

test('path traversal, separators, streams and reserved names are rejected before creating files', () => {
  const h = fixture();
  for (const name of ['', '.', '..', '../escape', 'nested/file', 'nested\\file', '/absolute', 'C:stream', 'NUL.json', 'a\0b']) {
    assert.equal(h.writer(name, {}), false, name);
  }
  assert.deepEqual(h.files.names(), []); assert.equal(h.files.calls.length, 0);
  assert.equal(h.errors.every(code => code === 'artifact-invalid-path'), true);
  const output = createArtifactWriter('relative-output', code => h.errors.push(code), h.files.fs);
  assert.equal(output('file.json', {}), false); assert.equal(h.errors.at(-1), 'artifact-invalid-path');
});

test('symlink ancestors, symlink entries and nonordinary run entries cannot be followed or overwritten', () => {
  for (const kind of ['symlink', 'directory', 'special']) {
    const h = fixture(); h.files.put('retained', 'old', kind);
    if (kind === 'directory') h.files.entries.set(path.join(h.output, 'retained', 'deeper'), {kind: 'directory'});
    assert.equal(h.writer('new.json', {}), false); assert.equal(h.errors.at(-1), 'artifact-file-type');
    assert.equal(h.files.calls.some(call => call[0] === 'open'), false);
  }
  const h = fixture(); h.files.entries.set(path.dirname(h.output), {kind: 'symlink'});
  assert.equal(h.writer('new.json', {}), false); assert.equal(h.errors.at(-1), 'artifact-file-type');
  assert.equal(h.files.calls.some(call => call[0] === 'open'), false);
});

test('new concurrent disk usage is rescanned before atomic rename and only the owned temporary is removed', () => {
  const h = fixture({totalBytes: 100, reserveBytes: 20}); h.files.put('case.json', 'retained');
  h.files.controls.afterWrite = () => h.files.put('external.json', 'x'.repeat(70));
  assert.equal(h.writer('case.json', 'new bytes'), false);
  assert.equal(h.files.read('case.json'), 'retained'); assert.equal(h.files.read('external.json').length, 70);
  assert.equal(h.files.calls.some(call => call[0] === 'rename'), false);
  assert.equal(h.files.calls.filter(call => call[0] === 'unlink').length, 1);
  assert.deepEqual(h.files.names(), ['case.json', 'external.json']); assert.equal(h.files.descriptors.size, 0);
});

test('write and rename failures preserve durable bytes, close descriptors and cannot leak errors or mask callers', () => {
  for (const failure of ['failWrite', 'failRename']) {
    const h = fixture({throwOnError: true}); h.files.put('case.json', 'retained'); h.files.controls[failure] = true;
    assert.doesNotThrow(() => assert.equal(h.writer('case.json', {private: 'metadata'}), false));
    assert.equal(h.files.read('case.json'), 'retained'); assert.deepEqual(h.files.names(), ['case.json']);
    assert.equal(h.files.descriptors.size, 0); assert.deepEqual(h.errors, ['artifact-write-failed']);
    assert.equal(h.writer.stats().failed, 1);
    h.files.controls[failure] = false;
    assert.equal(h.writer('footer.json', {capture_valid: false}, {final: true}), true);
    assert.equal(h.writer.stats().failed, 1); assert.equal(h.writer.stats().count, 2);
  }
});

test('undefined, circular and accessor failures return false and statistics snapshots cannot mutate accounting', () => {
  const h = fixture(), circular = {}; circular.self = circular;
  const accessor = {get secret() { throw Error('Private accessor detail'); }};
  for (const value of [undefined, circular, accessor]) assert.equal(h.writer('metadata.json', value), false);
  assert.deepEqual(h.errors, ['artifact-serialization-failed', 'artifact-serialization-failed', 'artifact-serialization-failed']);
  assert.deepEqual(h.files.names(), []);
  const snapshot = h.writer.stats(); snapshot.count = 0; snapshot.failed = 0;
  assert.equal(h.writer.stats().count, 3); assert.equal(h.writer.stats().failed, 3);
  assert.equal(h.writer.stats().includes_current_write, false);
  assert.equal(h.writer('safe.json', {before_current_write: h.writer.stats()}), true);
  const saved = JSON.parse(h.files.read('safe.json'));
  assert.equal(saved.before_current_write.count, 3); assert.equal(h.writer.stats().count, 4);
});

test('bad options and clocks fail safely while a missing output directory is created without recursive deletion', () => {
  const h = fixture(); h.files.entries.delete(h.output);
  assert.equal(h.writer('new.json', {}), true); assert.equal(h.files.calls[0][0], 'mkdir');
  for (const options of [{totalBytes: TOTAL_BYTES + 1}, {totalBytes: 10, reserveBytes: 10},
    {get totalBytes() { throw Error('Private configuration'); }}, {now: () => NaN}]) {
    const errors = [], writer = createArtifactWriter(h.output, code => errors.push(code), h.files.fs, options);
    assert.doesNotThrow(() => assert.equal(writer('bad.json', {}), false));
    assert.equal(writer.stats().failed > 0, true); assert.equal(errors.length > 0, true);
  }
  assert.equal(h.writer('new.json', {}, {get maxBytes() { throw Error('Private entry option'); }}), false);
  assert.deepEqual(h.files.names(), ['new.json']);
});

test('eight 4096-byte calibration artifacts use exact compact ASCII JSON bytes within default limits', () => {
  const h = fixture({totalBytes: TOTAL_BYTES, reserveBytes: RESERVE_BYTES});
  for (let index = 0; index < 8; index++) assert.equal(h.writer('calibration-' + index + '.json', 'x'.repeat(4094), {maxBytes: 4096}), true);
  assert.equal(h.files.names().reduce((sum, name) => sum + Buffer.byteLength(h.files.read(name)), 0), 32768);
  assert.equal(h.writer.stats().count, 8); assert.equal(h.writer.stats().failed, 0);
  assert.equal(CASE_BYTES, 2 * 1024 * 1024); assert.equal(RESERVE_BYTES, 64 * 1024); assert.equal(TOTAL_BYTES, 12 * 1024 * 1024);
});

test('one shared outer budget counts parent UTF8 files and run files before child writes or replacements', () => {
  const budgetRoot = path.resolve('synthetic-outer-artifacts'), output = path.join(budgetRoot, 'run-owned');
  const files = fakeFileSystem(output), errors = [];
  files.entries.set(path.join(budgetRoot, 'preflight.log'), {kind: 'file', text: '雪'.repeat(10)}); // 30 UTF8 bytes.
  files.entries.set(path.join(budgetRoot, 'workload-claim.json'), {kind: 'file', text: 'x'.repeat(10)});
  files.put('case.json', 'x'.repeat(20));
  const write = createArtifactWriter(output, code => errors.push(code), files.fs, {budgetRoot, totalBytes: 100, reserveBytes: 20});
  assert.equal(write.checkBudget(20), true); assert.equal(write.checkBudget(21), false);
  assert.equal(write('case.json', 'x'.repeat(19)), false); // Existing60 + staged21 exceeds ordinary80.
  assert.equal(files.read('case.json').length, 20);
  assert.equal(write('case.json', 'x'.repeat(18)), true);
  assert.equal(files.read('case.json'), JSON.stringify('x'.repeat(18)));
  assert.equal(files.entries.get(path.join(budgetRoot, 'preflight.log')).text, '雪'.repeat(10));
  assert.equal(files.entries.get(path.join(budgetRoot, 'workload-claim.json')).text.length, 10);
  assert.deepEqual(files.names(), ['case.json']);
});

test('parent footer writes share the same total and reserve with their single run payload directory', () => {
  const output = path.resolve('synthetic-outer-footer'), run = path.join(output, 'run-owned'), files = fakeFileSystem(run), errors = [];
  files.entries.set(path.join(output, 'preflight.log'), {kind: 'file', text: 'x'.repeat(50)}); files.put('case.json', 'x'.repeat(30));
  const write = createArtifactWriter(output, code => errors.push(code), files.fs, {budgetRoot: output, totalBytes: 100, reserveBytes: 20});
  assert.equal(write('latest.json', 'x'.repeat(8)), false);
  assert.equal(write('latest.json', 'x'.repeat(8), {final: true}), true);
  assert.equal(files.entries.get(path.join(output, 'latest.json')).text, JSON.stringify('x'.repeat(8)));
  assert.equal(write('latest.json', 'x'.repeat(18), {final: true}), false); // Existing90 + replacement20 exceeds100.
  assert.equal(files.entries.get(path.join(output, 'latest.json')).text, JSON.stringify('x'.repeat(8)));
  assert.equal(files.read('case.json').length, 30);
});

test('outer usage added after staging is included in the commit rescan and preserves prior run bytes', () => {
  const budgetRoot = path.resolve('synthetic-outer-race'), output = path.join(budgetRoot, 'run-owned'), files = fakeFileSystem(output), errors = [];
  files.entries.set(path.join(budgetRoot, 'preflight.log'), {kind: 'file', text: 'x'.repeat(40)}); files.put('case.json', 'x'.repeat(20));
  files.controls.afterWrite = () => files.entries.set(path.join(budgetRoot, 'unexpected.log'), {kind: 'file', text: 'x'});
  const write = createArtifactWriter(output, code => errors.push(code), files.fs, {budgetRoot, totalBytes: 100, reserveBytes: 20});
  assert.equal(write('case.json', 'x'.repeat(18)), false);
  assert.equal(errors.at(-1), 'artifact-total-cap'); assert.equal(files.read('case.json').length, 20);
  assert.deepEqual(files.names(), ['case.json']); assert.equal(files.descriptors.size, 0);
});

test('shared budgets reject escape paths, unrelated parents, symlinks and a second or deeper directory', () => {
  const budgetRoot = path.resolve('synthetic-outer-scope'), output = path.join(budgetRoot, 'run-owned');
  for (const candidate of [path.dirname(budgetRoot), path.join(budgetRoot, 'other-parent'), 'relative-root']) {
    const files = fakeFileSystem(output), errors = [], write = createArtifactWriter(output, code => errors.push(code), files.fs, {budgetRoot: candidate});
    assert.equal(write('metadata.json', {}), false); assert.equal(errors.at(-1), 'artifact-invalid-path');
    assert.equal(files.calls.some(call => call[0] === 'open'), false);
  }
  for (const change of [
    files => files.entries.set(budgetRoot, {kind: 'symlink'}),
    files => files.entries.set(path.join(budgetRoot, 'other-run'), {kind: 'directory'}),
    files => files.entries.set(path.join(output, 'nested'), {kind: 'directory'}),
    files => files.entries.set(path.join(budgetRoot, 'parent-link'), {kind: 'symlink'}),
  ]) {
    const files = fakeFileSystem(output), errors = []; change(files);
    const write = createArtifactWriter(output, code => errors.push(code), files.fs, {budgetRoot});
    assert.equal(write('metadata.json', {}), false); assert.equal(errors.at(-1), 'artifact-file-type');
    assert.equal(files.calls.some(call => call[0] === 'open'), false);
  }
});
