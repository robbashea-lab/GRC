const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {validateProfiles} = require('./profile-validation.cjs');

const PID = 2627;
const filename = (pid = PID, thread = 0, sequence = 1) => `CPU.20261101.162400.${pid}.${thread}.${String(sequence).padStart(3, '0')}.cpuprofile`;
const frame = name => ({functionName: name, scriptId: '1', url: 'file:///synthetic/example.cjs', lineNumber: 0, columnNumber: 0});
const profile = () => ({nodes: [{id: 1, callFrame: frame('(root)'), children: [2]}, {id: 2, callFrame: frame('syntheticWork')}],
  startTime: 100000, endTime: 130000, samples: [1, 2, 2], timeDeltas: [10000, 10000, 9000]});
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-cpu-validation-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return {directory, write(name, value) {
    const bytes = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value);
    fs.writeFileSync(path.join(directory, name), bytes);
    return Buffer.from(bytes);
  }, validate(options = {}) { return validateProfiles(directory, {pid: PID, ...options}); }};
}

test('reconciles every ordinary file and the actual-Jest main-thread profile without changing bytes', t => {
  const h = fixture(t), raw = h.write(filename(), profile()), receipt = h.write('runtime.json', '{"synthetic":true}');
  const before = fs.readdirSync(h.directory).sort();
  const result = h.validate();
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.limits_enforced, false);
  assert.equal(result.main_profile, filename());
  assert.equal(result.total_bytes, raw.length + receipt.length);
  assert.deepEqual(result.files.map(file => [file.name, file.bytes, file.sha256]),
    [[filename(), raw.length, hash(raw)], ['runtime.json', receipt.length, hash(receipt)]]);
  assert.deepEqual(result.profiles[0], {name: filename(), pid: PID, thread_id: 0, sequence: 1, role: 'main_thread', valid: true,
    errors: [], node_count: 2, sample_count: 3, start_time_us: 100000, end_time_us: 130000, duration_us: 30000, sample_delta_us: 29000});
  assert.deepEqual(fs.readdirSync(h.directory).sort(), before);
  assert.deepEqual(fs.readFileSync(path.join(h.directory, filename())), raw);
  assert.deepEqual(fs.readFileSync(path.join(h.directory, 'runtime.json')), receipt);
});

test('distinguishes additional threads without calling them ISO-only or merging their samples', t => {
  const h = fixture(t);
  h.write(filename(), profile()); h.write(filename(PID, 4), profile());
  const result = h.validate();
  assert.equal(result.valid, true);
  assert.deepEqual(result.profiles.map(row => [row.thread_id, row.role, row.sample_count]), [[0, 'main_thread', 3], [4, 'additional_thread', 3]]);
  assert.equal(Object.hasOwn(result, 'iso_cpu_us'), false);
});

test('rejects missing or multiple main-thread profiles while retaining their identities', t => {
  const h = fixture(t);
  assert.match(h.validate().errors.join('\n'), /exactly one/);
  h.write(filename(PID, 2), profile());
  assert.match(h.validate().errors.join('\n'), /exactly one/);
  h.write(filename(), profile()); h.write(filename(PID, 0, 2), profile());
  const result = h.validate();
  assert.equal(result.valid, false);
  assert.equal(result.main_profile, null);
  assert.equal(result.profiles.length, 3);
});

test('rejects wrapper or foreign-process profiles even when a matching main profile exists', t => {
  const h = fixture(t);
  h.write(filename(), profile());
  const raw = h.write(filename(2620), profile());
  const result = h.validate();
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /PID differs/);
  assert.equal(result.files.find(file => file.name === filename(2620)).sha256, hash(raw));
});

test('requires the native filename form and safe process/thread/sequence IDs', t => {
  const h = fixture(t);
  h.write('CPU.20261101.162400.2627.00.0.cpuprofile', profile());
  h.write(`CPU.20261101.162400.${PID}.0.1.cpuprofile`, profile());
  h.write(filename(PID, 0, 0), profile());
  h.write(`CPU.20261101.162400.${PID}.0.9007199254740992.cpuprofile`, profile());
  const result = h.validate();
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /native default/);
  assert.match(result.errors.join('\n'), /unsafe IDs/);
});

test('preserves malformed and incomplete profile bytes instead of accepting JSON truncation', t => {
  const h = fixture(t), raw = h.write(filename(), '{"nodes":[');
  const result = h.validate();
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /JSON is malformed or incomplete/);
  assert.equal(result.files[0].sha256, hash(raw));
  assert.deepEqual(fs.readFileSync(path.join(h.directory, filename())), raw);
});

test('rejects invalid UTF8 instead of silently replacing profile text', t => {
  const h = fixture(t), text = JSON.stringify(profile());
  const marker = text.indexOf('syntheticWork');
  const raw = Buffer.concat([Buffer.from(text.slice(0, marker)), Buffer.from([0xff]), Buffer.from(text.slice(marker + 1))]);
  h.write(filename(), raw);
  const result = h.validate();
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /JSON is malformed or incomplete/);
  assert.equal(result.files[0].sha256, hash(raw));
});

const invalidStructures = [
  ['no nodes', value => { value.nodes = []; }, /nodes are missing/],
  ['duplicate nodes', value => { value.nodes[1].id = 1; }, /IDs are invalid or duplicated/],
  ['nonpositive node', value => { value.nodes[1].id = 0; }, /IDs are invalid/],
  ['missing frame', value => { delete value.nodes[1].callFrame; }, /call frame is invalid/],
  ['missing child', value => { value.nodes[0].children = [3]; }, /child references are invalid/],
  ['duplicate child', value => { value.nodes[0].children = [2, 2]; }, /child references are invalid/],
  ['missing sample array', value => { delete value.samples; }, /samples are missing/],
  ['empty samples', value => { value.samples = []; value.timeDeltas = []; }, /samples are missing/],
  ['unknown sample', value => { value.samples[1] = 99; }, /samples are missing or reference unknown/],
  ['delta count', value => { value.timeDeltas.pop(); }, /deltas are invalid or incomplete/],
  ['missing deltas', value => { delete value.timeDeltas; }, /deltas are invalid or incomplete/],
  ['negative delta', value => { value.timeDeltas[1] = -1; }, /deltas are invalid or incomplete/],
  ['overflowed delta sum', value => { value.timeDeltas = [1e308, 1e308, 1e308]; }, /delta total is invalid/],
  ['nonnull nonnumber delta', value => { value.timeDeltas[1] = '10000'; }, /deltas are invalid or incomplete/],
  ['missing end time', value => { delete value.endTime; }, /time range is invalid or incomplete/],
  ['zero duration', value => { value.endTime = value.startTime; }, /time range is invalid or incomplete/],
  ['negative start', value => { value.startTime = -1; }, /time range is invalid or incomplete/],
];
for (const [name, mutate, expected] of invalidStructures) test('rejects structural incompleteness: ' + name, t => {
  const h = fixture(t), value = profile(); mutate(value);
  h.write(filename(), value);
  const result = h.validate();
  assert.equal(result.valid, false);
  assert.equal(result.profiles[0].valid, false);
  assert.match(result.errors.join('\n'), expected);
});

test('detects profile limit before JSON parsing, hashes and retains all oversized bytes', t => {
  const h = fixture(t), raw = h.write(filename(), '{invalid JSON and larger than the deliberately tiny limit}');
  const result = h.validate({maxProfileBytes: 8});
  assert.equal(result.valid, false);
  assert.equal(result.limits_enforced, false);
  assert.equal(result.files[0].bytes, raw.length);
  assert.equal(result.files[0].sha256, hash(raw));
  assert.match(result.errors.join('\n'), /Profile exceeds the detection limit/);
  assert.doesNotMatch(result.errors.join('\n'), /JSON is malformed/);
  assert.deepEqual(fs.readFileSync(path.join(h.directory, filename())), raw);
});

test('detects combined output limit without omitting logs or parsing profiles afterward', t => {
  const h = fixture(t), raw = h.write(filename(), profile()), log = h.write('stderr.log', 'preserve this too');
  const result = h.validate({maxTotalBytes: raw.length});
  assert.equal(result.valid, false);
  assert.equal(result.total_bytes, raw.length + log.length);
  assert.equal(result.files.length, 2);
  assert.deepEqual(result.files.map(file => file.sha256), [hash(raw), hash(log)]);
  assert.match(result.errors.join('\n'), /Combined output exceeds/);
  assert.match(result.errors.join('\n'), /parsing withheld/);
  assert.equal(Object.hasOwn(result.profiles[0], 'sample_count'), false);
});

test('accepts exact inclusive byte limits', t => {
  const h = fixture(t), raw = h.write(filename(), profile());
  assert.equal(h.validate({maxProfileBytes: raw.length, maxTotalBytes: raw.length}).valid, true);
});

test('rejects nested entries without reading their contents', t => {
  const h = fixture(t);
  h.write(filename(), profile());
  fs.mkdirSync(path.join(h.directory, 'nested'));
  fs.writeFileSync(path.join(h.directory, 'nested', 'outside.json'), 'must not be read');
  const result = h.validate(), nested = result.files.find(file => file.name === 'nested');
  assert.equal(result.valid, false);
  assert.equal(nested.kind, 'directory');
  assert.equal(nested.sha256, null);
  assert.equal(nested.bytes, null);
  assert.match(result.errors.join('\n'), /not an ordinary flat file/);
});

test('rejects a linked entry without following it outside the output directory', t => {
  const h = fixture(t), outside = fixture(t);
  h.write(filename(), profile());
  outside.write('private.json', 'never read');
  fs.symlinkSync(outside.directory, path.join(h.directory, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = h.validate(), linked = result.files.find(file => file.name === 'linked');
  assert.equal(result.valid, false);
  assert.equal(linked.kind, 'symbolic_link');
  assert.equal(linked.sha256, null);
  assert.equal(linked.bytes, null);
});

test('rejects a linked output directory and linked ancestors before enumerating files', t => {
  const h = fixture(t), outside = fixture(t);
  outside.write(filename(), profile());
  const linked = path.join(h.directory, 'linked');
  fs.symlinkSync(outside.directory, linked, process.platform === 'win32' ? 'junction' : 'dir');
  const result = validateProfiles(linked, {pid: PID});
  assert.equal(result.valid, false);
  assert.deepEqual(result.files, []);
  assert.match(result.errors.join('\n'), /UNSAFE_DIRECTORY/);
  fs.mkdirSync(path.join(outside.directory, 'child'));
  assert.match(validateProfiles(path.join(linked, 'child'), {pid: PID}).errors.join('\n'), /UNSAFE_DIRECTORY/);
});

test('returns an invalid result for missing directories and invalid contract values', t => {
  const h = fixture(t);
  assert.match(validateProfiles(path.join(h.directory, 'absent'), {pid: PID}).errors.join('\n'), /ENOENT/);
  for (const options of [{pid: 0}, {pid: 1}, {pid: 1.5}, {pid: PID, maxProfileBytes: 0}, {pid: PID, maxTotalBytes: NaN}]) {
    const result = validateProfiles(h.directory, options);
    assert.equal(result.valid, false);
    assert.deepEqual(result.files, []);
    assert.match(result.errors.join('\n'), /Invalid absolute output directory/);
  }
  assert.equal(validateProfiles('relative-output', {pid: PID}).valid, false);
});
