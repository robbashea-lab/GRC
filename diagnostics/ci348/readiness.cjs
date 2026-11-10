'use strict';
// A metadata capture only. This file has no test, fixture or observer invocation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const BASE = '3394388b3a3a1c3ae6ee67f70edb19f7c04fcfbb';
const TREE = 'ba698e9c43519d79cc38bc061d7b13e40f6089c3';
const OLD_IMAGE = '20261101.360.1';
const begun = Date.now();
const safeToken = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(value) ? value : 'UNCONFIRMED';
const summary = {
  purpose:'CI348_METADATA_ONLY_NOT_QUALIFICATION',
  subjectSha:BASE,
  driverSha:/^[a-f0-9]{40}$/.test(process.env.CI348_DRIVER_SHA || '') ? process.env.CI348_DRIVER_SHA : 'UNCONFIRMED',
  runId:/^\d+$/.test(process.env.CI348_RUN_ID || '') ? process.env.CI348_RUN_ID : 'UNCONFIRMED',
  attempt:process.env.CI348_ATTEMPT === '1' ? 1 : null,
  repositoryPublic:process.env.CI348_REPOSITORY_PRIVATE==='false' ? true : process.env.CI348_REPOSITORY_PRIVATE==='true' ? false : null,
  platform:safeToken(process.platform),arch:safeToken(process.arch),nodeVersion:safeToken(process.version),
  actualImageOS:safeToken(process.env.ImageOS),actualImageVersion:safeToken(process.env.ImageVersion),
  originalImageVersion:OLD_IMAGE,
  timezone:'UNCONFIRMED',
  sourcePinsMatch:false,driverPinsMatch:false,executableMetadataReadable:false,
  oldImageMatches:false,metadataComplete:false,
  diagnosticExecuted:false,testsExecuted:false,fixtureImported:false,observerApplied:false,
  rawDiagnosticEvidenceCreated:false,measurementAdmitted:false,releaseQualified:false,
  currentTargetApproved:false,containmentEstablished:false,privateEvidenceRouteEstablished:false,
  reasons:[],status:'BLOCKED'
};
function requireThat(ok,code) { if(!ok) throw new Error(code); }
function budget() { requireThat(Date.now()-begun < 30000,'READINESS_30S_CUTOFF'); }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function git(cwd,args) {
  budget();
  const r=spawnSync('/usr/bin/git',['--no-optional-locks','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-C',cwd,...args],{encoding:'utf8',timeout:1000,killSignal:'SIGKILL',maxBuffer:1024*1024});
  requireThat(!r.error && r.status===0,'GIT_METADATA_UNAVAILABLE');
  return r.stdout.trim();
}
let exit=1, output;
try {
  requireThat(process.env.CI348_EVENT==='push' && process.env.CI348_REF==='refs/heads/codex/ci348-readiness-20261110' && process.env.CI348_REPOSITORY==='robbashea-lab/GRC','WRONG_EVENT_OR_REF');
  requireThat(summary.attempt===1 && summary.runId!=='UNCONFIRMED' && summary.driverSha!=='UNCONFIRMED','FIRST_ATTEMPT_IDENTITY_REQUIRED');
  requireThat(summary.repositoryPublic!==null,'REPOSITORY_VISIBILITY_UNCONFIRMED');
  requireThat(process.platform==='linux' && process.arch==='x64' && process.version==='v22.23.4' && process.execArgv.length===0,'RUNTIME_MISMATCH');
  requireThat(!process.env.NODE_OPTIONS && !process.env.NODE_PATH && !process.env.NODE_V8_COVERAGE,'UNEXPECTED_NODE_STARTUP');
  const workspace=process.env.CI348_WORKSPACE;
  requireThat(workspace && path.isAbsolute(workspace),'MISSING_OWNED_WORKSPACE');
  const subject=path.join(workspace,'subject'), driver=path.join(workspace,'driver');
  const requestedOutput=process.env.CI348_SUMMARY_ROOT;
  requireThat(requestedOutput && path.isAbsolute(requestedOutput) && path.dirname(requestedOutput)===process.env.RUNNER_TEMP && !fs.existsSync(requestedOutput),'UNIQUE_TEMP_OUTPUT_REQUIRED');
  output=requestedOutput;
  const binding=JSON.parse(fs.readFileSync(path.join(__dirname,'expected-source.json'),'utf8'));
  requireThat(binding.base===BASE && binding.tree===TREE,'EXPECTED_SOURCE_METADATA_MISMATCH');
  summary.driverPinsMatch=git(driver,['rev-parse','HEAD'])===summary.driverSha;
  requireThat(summary.driverPinsMatch,'DRIVER_REVISION_MISMATCH');
  requireThat(git(subject,['rev-parse','HEAD'])===BASE && git(subject,['rev-parse','HEAD^{tree}'])===TREE && git(subject,['status','--porcelain=v1','--untracked-files=all'])==='','SUBJECT_SOURCE_NOT_EXACT');
  for(const [relative,digest] of Object.entries(binding.inputs)) {
    budget();
    requireThat(!path.isAbsolute(relative) && !relative.split('/').includes('..') && /^[a-f0-9]{64}$/.test(digest),'INVALID_SOURCE_PIN');
    requireThat(sha(fs.readFileSync(path.join(subject,relative)))===digest,'SOURCE_INPUT_MISMATCH');
  }
  const test=fs.readFileSync(path.join(subject,'frontend/src/preview/programs/prestigeEightYearSource.test.js'));
  requireThat(crypto.createHash('sha1').update(Buffer.from('blob '+test.length+'\0')).update(test).digest('hex')===binding.testBlob,'TEST_BLOB_MISMATCH');
  summary.sourcePinsMatch=true;
  summary.timezone=safeToken(Intl.DateTimeFormat().resolvedOptions().timeZone);
  requireThat(summary.timezone==='UTC','UTC_RUNTIME_REQUIRED');
  summary.oldImageMatches=summary.actualImageOS==='ubuntu24' && summary.actualImageVersion===OLD_IMAGE;
  // Read only the already available named executables. Do not install or select a fallback.
  for(const executable of [process.execPath,'/usr/bin/git','/usr/bin/timeout','/usr/bin/sh']) {budget();requireThat(fs.statSync(executable).isFile() && fs.statSync(executable).size>0,'NAMED_EXECUTABLE_UNAVAILABLE');fs.accessSync(executable,fs.constants.R_OK|fs.constants.X_OK);}
  summary.executableMetadataReadable=true;
  budget();
  summary.metadataComplete=true;
  if(!summary.oldImageMatches) summary.reasons.push('ORIGINAL_RUNNER_IMAGE_NOT_MATCHED');
  if(summary.repositoryPublic) summary.reasons.push('PRIVATE_RAW_EVIDENCE_ROUTE_NOT_ESTABLISHED');
  summary.reasons.push('NO_MEASUREMENT_ADMISSION','NO_CONTAINMENT_PROOF','NO_FROZEN_INSTALL_RECEIPT');
  summary.status='METADATA_CAPTURED_MEASUREMENT_BLOCKED';
  exit=0;
} catch(error) {
  const codes=new Set(['READINESS_30S_CUTOFF','GIT_METADATA_UNAVAILABLE','WRONG_EVENT_OR_REF','FIRST_ATTEMPT_IDENTITY_REQUIRED','REPOSITORY_VISIBILITY_UNCONFIRMED','RUNTIME_MISMATCH','UNEXPECTED_NODE_STARTUP','MISSING_OWNED_WORKSPACE','UNIQUE_TEMP_OUTPUT_REQUIRED','EXPECTED_SOURCE_METADATA_MISMATCH','DRIVER_REVISION_MISMATCH','SUBJECT_SOURCE_NOT_EXACT','INVALID_SOURCE_PIN','SOURCE_INPUT_MISMATCH','TEST_BLOB_MISMATCH','UTC_RUNTIME_REQUIRED','NAMED_EXECUTABLE_UNAVAILABLE']);
  summary.reasons.push(codes.has(error.message)?error.message:'UNCLASSIFIED_READINESS_ERROR');
}
try {
  // Only these explicit fields leave the runner; no raw outputs, host names, paths or environment dump.
  requireThat(output && !fs.existsSync(output),'SAFE_SUMMARY_OUTPUT_NOT_UNIQUE');
  fs.mkdirSync(output,{mode:0o700});
  fs.writeFileSync(path.join(output,'safe-summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx',mode:0o600});
  requireThat(typeof process.env.GITHUB_OUTPUT==='string' && path.isAbsolute(process.env.GITHUB_OUTPUT) && path.relative(process.env.RUNNER_TEMP,process.env.GITHUB_OUTPUT).split(path.sep)[0]!=='..' && fs.lstatSync(process.env.GITHUB_OUTPUT).isFile(),'GITHUB_OUTPUT_UNAVAILABLE');
  fs.appendFileSync(process.env.GITHUB_OUTPUT,'safe_summary_written=true\n');
} catch(_) {exit=2;}
process.stdout.write('CI348 metadata-only capture finished; no tests or diagnostic executed.\n');
process.exitCode=exit;
