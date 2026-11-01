// Read-only admission of raw diagnostic evidence; these limits detect excess bytes after Node writes them.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {TextDecoder} = require('node:util');

const DEFAULT_PROFILE_BYTES = 8 * 1024 * 1024;
const DEFAULT_TOTAL_BYTES = 12 * 1024 * 1024;
// Node22 DiagnosticFilename pads the positive sequence to at least three digits (src/util.cc).
const PROFILE_NAME = /^CPU\.(\d{8})\.(\d{6})\.([1-9]\d*)\.(0|[1-9]\d*)\.(\d{3}|[1-9]\d{3,})\.cpuprofile$/;
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const code = error => typeof error?.code === 'string' ? error.code : 'UNKNOWN';

function ordinaryDirectory(directory) {
  for (let current = directory; ; current = path.dirname(current)) {
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Object.assign(Error(), {code: 'UNSAFE_DIRECTORY'});
    if (path.dirname(current) === current) return;
  }
}

function fileEvidence(file, initial, capture) {
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.dev !== initial.dev || stat.ino !== initial.ino || stat.size !== initial.size) {
      throw Object.assign(Error(), {code: 'FILE_CHANGED'});
    }
    const hash = crypto.createHash('sha256'), chunks = [], buffer = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (offset < stat.size) {
      const bytes = fs.readSync(descriptor, buffer, 0, Math.min(buffer.length, stat.size - offset), offset);
      if (!bytes) throw Object.assign(Error(), {code: 'FILE_TRUNCATED'});
      const chunk = buffer.subarray(0, bytes);
      hash.update(chunk);
      if (capture) chunks.push(Buffer.from(chunk));
      offset += bytes;
    }
    const final = fs.fstatSync(descriptor);
    if (final.size !== stat.size || final.mtimeMs !== stat.mtimeMs || final.ctimeMs !== stat.ctimeMs) {
      throw Object.assign(Error(), {code: 'FILE_CHANGED'});
    }
    return {sha256: hash.digest('hex'), ...(capture ? {content: Buffer.concat(chunks)} : {})};
  } finally {
    fs.closeSync(descriptor);
  }
}

function profileStructure(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {errors: ['Profile must be an object']};
  const nodes = value.nodes, samples = value.samples, deltas = value.timeDeltas;
  const ids = new Set();
  if (!Array.isArray(nodes) || !nodes.length) errors.push('Profile nodes are missing or empty');
  else {
    for (const node of nodes) {
      if (!node || !positiveInteger(node.id) || ids.has(node.id)) errors.push('Profile node IDs are invalid or duplicated');
      else ids.add(node.id);
      const frame = node?.callFrame;
      if (!frame || typeof frame.functionName !== 'string' || typeof frame.scriptId !== 'string' || typeof frame.url !== 'string'
        || !Number.isSafeInteger(frame.lineNumber) || frame.lineNumber < -1
        || !Number.isSafeInteger(frame.columnNumber) || frame.columnNumber < -1) errors.push('Profile call frame is invalid');
    }
    for (const node of nodes) {
      if (node?.children !== undefined && (!Array.isArray(node.children)
        || node.children.some(id => !positiveInteger(id) || !ids.has(id))
        || new Set(node.children).size !== node.children.length)) errors.push('Profile child references are invalid');
    }
  }
  if (!Array.isArray(samples) || !samples.length || samples.some(id => !positiveInteger(id) || !ids.has(id))) {
    errors.push('Profile samples are missing or reference unknown nodes');
  }
  if (!Array.isArray(deltas) || !Array.isArray(samples) || deltas.length !== samples.length
    || deltas.some(value => !Number.isFinite(value) || value < 0)) errors.push('Profile sample deltas are invalid or incomplete');
  if (!Number.isFinite(value.startTime) || value.startTime < 0 || !Number.isFinite(value.endTime) || value.endTime <= value.startTime) {
    errors.push('Profile time range is invalid or incomplete');
  }
  const sampleDelta = Array.isArray(deltas) ? deltas.reduce((sum, delta) => sum + delta, 0) : NaN;
  if (!Number.isFinite(sampleDelta)) errors.push('Profile delta total is invalid');
  if (errors.length) return {errors: [...new Set(errors)]};
  return {errors: [], node_count: nodes.length, sample_count: samples.length,
    start_time_us: value.startTime, end_time_us: value.endTime, duration_us: value.endTime - value.startTime,
    sample_delta_us: sampleDelta};
}

function validateProfiles(directory, {pid, maxProfileBytes = DEFAULT_PROFILE_BYTES, maxTotalBytes = DEFAULT_TOTAL_BYTES} = {}) {
  const result = {valid: false, directory, errors: [], total_bytes: 0, files: [], profiles: [], main_profile: null,
    limits: {profile_bytes: maxProfileBytes, total_bytes: maxTotalBytes}, limits_enforced: false};
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || !positiveInteger(pid) || pid <= 1
    || !positiveInteger(maxProfileBytes) || !positiveInteger(maxTotalBytes)) {
    result.errors.push('Invalid absolute output directory, actual Jest PID or byte limits');
    return result;
  }
  directory = path.resolve(directory);
  result.directory = directory;
  let names;
  try {
    ordinaryDirectory(directory);
    names = fs.readdirSync(directory).sort();
  } catch (error) {
    result.errors.push('Cannot inspect ordinary output directory: ' + code(error));
    return result;
  }
  const stats = new Map();
  for (const name of names) {
    const entry = {name, kind: 'unknown', bytes: null, sha256: null, errors: []};
    result.files.push(entry);
    if (name !== path.basename(name) || path.relative(directory, path.join(directory, name)) !== name) {
      entry.errors.push('Entry is outside the flat output directory');
      continue;
    }
    try {
      const stat = fs.lstatSync(path.join(directory, name));
      if (stat.isSymbolicLink()) entry.kind = 'symbolic_link';
      else if (stat.isDirectory()) entry.kind = 'directory';
      else if (stat.isFile()) {
        entry.kind = name.endsWith('.cpuprofile') ? 'cpu_profile' : 'file';
        entry.bytes = stat.size;
        if (!Number.isSafeInteger(stat.size) || stat.size < 0 || !Number.isSafeInteger(result.total_bytes + stat.size)) {
          entry.errors.push('Entry byte count is unsafe');
        } else {
          result.total_bytes += stat.size;
          stats.set(name, stat);
        }
      }
      if (entry.kind !== 'file' && entry.kind !== 'cpu_profile') entry.errors.push('Entry is not an ordinary flat file');
    } catch (error) {
      entry.errors.push('Cannot inspect entry: ' + code(error));
    }
  }
  if (result.total_bytes > maxTotalBytes) result.errors.push('Combined output exceeds the detection limit');
  for (const entry of result.files) {
    if (!stats.has(entry.name)) continue;
    const isProfile = entry.kind === 'cpu_profile';
    let profile = null;
    if (isProfile) {
      profile = {name: entry.name, pid: null, thread_id: null, sequence: null, role: null, valid: false, errors: []};
      result.profiles.push(profile);
      const match = PROFILE_NAME.exec(entry.name);
      if (!match) profile.errors.push('Profile filename does not match the native default');
      else {
        profile.pid = Number(match[3]); profile.thread_id = Number(match[4]); profile.sequence = Number(match[5]);
        profile.role = profile.thread_id === 0 ? 'main_thread' : 'additional_thread';
        if (![profile.pid, profile.thread_id, profile.sequence].every(Number.isSafeInteger) || profile.pid !== pid || profile.sequence < 1) {
          profile.errors.push('Profile filename PID differs from actual Jest or contains unsafe IDs');
        }
      }
      if (entry.bytes > maxProfileBytes) profile.errors.push('Profile exceeds the detection limit');
    }
    const capture = isProfile && !profile.errors.length && result.total_bytes <= maxTotalBytes;
    try {
      const evidence = fileEvidence(path.join(directory, entry.name), stats.get(entry.name), capture);
      entry.sha256 = evidence.sha256;
      if (capture) {
        try {
          const structure = profileStructure(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(evidence.content)));
          Object.assign(profile, structure);
        } catch {
          profile.errors.push('Profile JSON is malformed or incomplete');
        }
      } else if (isProfile && result.total_bytes > maxTotalBytes) profile.errors.push('Profile parsing withheld after combined output limit');
    } catch (error) {
      entry.errors.push('Cannot read stable ordinary entry: ' + code(error));
    }
    if (profile) {
      profile.errors.push(...entry.errors);
      profile.valid = profile.errors.length === 0;
      entry.errors.push(...profile.errors.filter(error => !entry.errors.includes(error)));
    }
  }
  const main = result.profiles.filter(profile => profile.pid === pid && profile.thread_id === 0);
  if (main.length !== 1) result.errors.push('Expected exactly one actual-Jest main-thread profile');
  else result.main_profile = main[0].name;
  for (const entry of result.files) for (const error of entry.errors) result.errors.push(JSON.stringify(entry.name) + ': ' + error);
  result.valid = result.errors.length === 0;
  return result;
}

module.exports = {validateProfiles};
