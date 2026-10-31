// Diagnostic metadata only. These limits never apply to application records or saves.
const fs = require('node:fs');
const path = require('node:path');
const {performance} = require('node:perf_hooks');

const TOTAL_BYTES = 12 * 1024 * 1024;
const RESERVE_BYTES = 64 * 1024;
const CASE_BYTES = 2 * 1024 * 1024;
let temporarySequence = 0;
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;
const safeName = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
  && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value);

function createArtifactWriter(output, onError, fileSystem = fs, options = {}) {
  let now = () => performance.now(), totalBytes = TOTAL_BYTES, reserveBytes = RESERVE_BYTES, budgetRoot = output, validConfiguration = true;
  try {
    if (options.now !== undefined) now = options.now;
    if (options.totalBytes !== undefined) totalBytes = options.totalBytes;
    if (options.reserveBytes !== undefined) reserveBytes = options.reserveBytes;
    if (options.budgetRoot !== undefined) budgetRoot = options.budgetRoot;
    validConfiguration = typeof now === 'function' && nonnegativeInteger(totalBytes) && totalBytes > 0 && totalBytes <= TOTAL_BYTES
      && nonnegativeInteger(reserveBytes) && reserveBytes <= RESERVE_BYTES && reserveBytes < totalBytes;
  } catch { validConfiguration = false; }
  if (typeof now !== 'function') now = () => performance.now();
  const stats = {count: 0, failed: 0, wall_ms: 0};
  const notify = code => { try { onError?.(code); } catch {} };

  // Check each existing ancestor too; mkdir must not follow an existing symlink.
  function ensureDirectory(location, reject) {
    const absolute = path.resolve(location), root = path.parse(absolute).root;
    let current = root;
    const verify = directory => {
      const status = fileSystem.lstatSync(directory);
      if (!status.isDirectory() || status.isSymbolicLink()) reject('artifact-file-type');
    };
    verify(root);
    for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      try { verify(current); }
      catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        fileSystem.mkdirSync(current);
        verify(current);
      }
    }
    return absolute;
  }

  function locations(reject) {
    if ([output, budgetRoot].some(value => typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0'))) reject('artifact-invalid-path');
    const directory = path.resolve(output), budget = path.resolve(budgetRoot);
    if (directory !== budget && path.dirname(directory) !== budget) reject('artifact-invalid-path');
    ensureDirectory(directory, reject);
    return {directory, budget};
  }

  // The budget includes the outer preflight/claim/footer files and its single run directory.
  function directoryBytes(directory, reject, ownedChild = null, depth = 0) {
    let bytes = 0, children = 0;
    for (const name of fileSystem.readdirSync(directory)) {
      const file = path.join(directory, name), status = fileSystem.lstatSync(file);
      if (status.isSymbolicLink()) reject('artifact-file-type');
      if (status.isDirectory()) {
        if (depth !== 0 || ++children > 1 || ownedChild && file !== ownedChild) reject('artifact-file-type');
        bytes += directoryBytes(file, reject, null, depth + 1);
      } else {
        if (!status.isFile() || !nonnegativeInteger(status.size)) reject('artifact-file-type');
        bytes += status.size;
      }
      if (!Number.isSafeInteger(bytes)) reject('artifact-total-cap');
    }
    return bytes;
  }

  // Count write attempts; budget-check failures also remain sticky in failed/error evidence.
  function measured(action, writeAttempt) {
    if (writeAttempt) stats.count++;
    let start, result = false, failureCode = 'artifact-write-failed', failed = false;
    const reject = code => { failureCode = code; throw new Error('Diagnostic artifact rejected'); };
    try {
      start = now();
      if (!Number.isFinite(start)) reject('artifact-clock-failed');
      if (!validConfiguration) reject('artifact-configuration-invalid');
      action(reject);
      result = true;
    } catch {
      stats.failed++; failed = true; notify(failureCode);
    }
    try {
      const end = now();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('Invalid diagnostic clock');
      stats.wall_ms += end - start;
    } catch {
      if (!failed) stats.failed++;
      notify('artifact-clock-failed'); result = false;
    }
    return result;
  }

  const write = (name, value, entryOptions = {}) => measured(reject => {
    if (!safeName(name)) reject('artifact-invalid-path');
    const final = entryOptions.final === true;
    const maxBytes = entryOptions.maxBytes === undefined ? (final ? reserveBytes : CASE_BYTES) : entryOptions.maxBytes;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > (final ? reserveBytes : CASE_BYTES)) reject('artifact-entry-cap');
    let text;
    try { text = JSON.stringify(value); }
    catch { reject('artifact-serialization-failed'); }
    if (typeof text !== 'string') reject('artifact-serialization-failed');
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > maxBytes) reject('artifact-entry-cap');
    const {directory, budget} = locations(reject), limit = final ? totalBytes : totalBytes - reserveBytes;
    const ownedChild = directory === budget ? null : directory;
    // Keep both the prior durable destination and the staged replacement in the peak budget.
    if (directoryBytes(budget, reject, ownedChild) + bytes > limit) reject('artifact-total-cap');
    const destination = path.join(directory, name);
    const temporary = path.join(directory, '.artifact-' + process.pid + '-' + (++temporarySequence) + '.tmp');
    let descriptor = null, ownedTemporary = false;
    try {
      descriptor = fileSystem.openSync(temporary, 'wx', 0o600);
      ownedTemporary = true;
      fileSystem.writeFileSync(descriptor, text, {encoding: 'utf8'});
      fileSystem.closeSync(descriptor); descriptor = null;
      if (directoryBytes(budget, reject, ownedChild) > limit) reject('artifact-total-cap');
      fileSystem.renameSync(temporary, destination);
      ownedTemporary = false;
    } finally {
      if (descriptor !== null) { try { fileSystem.closeSync(descriptor); } catch {} }
      // Never remove another file or recurse. Exclusive open established ownership.
      if (ownedTemporary) {
        try {
          const status = fileSystem.lstatSync(temporary);
          if (status.isFile() && !status.isSymbolicLink()) fileSystem.unlinkSync(temporary);
        } catch {}
      }
    }
  }, true);

  write.stats = () => ({...stats, includes_current_write: false});
  write.checkBudget = (reservedAdditionalBytes = 0) => measured(reject => {
    if (!nonnegativeInteger(reservedAdditionalBytes)) reject('artifact-total-cap');
    const {directory, budget} = locations(reject);
    if (directoryBytes(budget, reject, directory === budget ? null : directory) + reservedAdditionalBytes > totalBytes - reserveBytes) reject('artifact-total-cap');
  }, false);
  return write;
}

module.exports = {createArtifactWriter, TOTAL_BYTES, RESERVE_BYTES, CASE_BYTES};
