const {test} = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const driver = require('./run.cjs');
const SHA = 'b'.repeat(40), runtime = {node: 'v22.23.4', execPath: '/usr/bin/node', platform: 'linux', arch: 'x64', timezone: 'UTC'};
const env = () => ({GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:SHA,PATH:'/usr/bin',ISO_SUMMARY_COST_DEADLINE_MS:String(Date.now()+719000)});
function fixture(failed = false) {
  const proof = {application_baseline_sha:driver.BASELINE,observed_source_sha:SHA,diagnostic_only:true,qualification:false};
  const guards = Object.fromEntries(driver.GUARDS.map(key=>[key,true]));
  const blocks=Array.from({length:5},()=>({iterations:1000,unobserved_count:1000,observed_count:1000,unobserved_ms:1,observed_ms:2,observer_valid:true}));
  const calibration={valid:true,blocks,io:{writes:8,bytes:32768,elapsed_ms:1}};
  const raw=driver.FRAMEWORKS.map((framework,index)=>({...proof,framework,ordinal:index+1,guards_preserved:true,
    native_guards_before:guards,native_guards_after:guards,stopped:false,call_cap_reached:false,depth_cap_reached:false,errors:[],
    calls:[{i:1,s:1,e:2,o:'returned',d:1,p:null}],totals:{started:1,returned:1,threw:0,retained:1,pending:0},
    observation_elapsed_ms:5,samples:[{elapsed_ms:0,memory:{rss:1}},{elapsed_ms:5,memory:{rss:1}}],cpu_usage_us:{user:1,system:1},memory:{rss:1}}));
  const cases=driver.CASES.map((name,index)=>({name,status:failed&&index===2?'failed':'passed',duration_ms:failed&&index===2?181000:10}));
  const execution={pid:3,status:failed?1:0,signal:null,error:null,hard_failure:null};
  const actual={...runtime,source_sha:SHA,application_baseline:driver.BASELINE,completed:true,diagnostic_only:true,qualification:false,
    pid:4,process_group_id:3,v8:'test',lifecycle_years:'5',synthetic_exports:false,summary_cost_logging:true,phase_logging:false,cases,
    elapsed_ms:30,cpu_usage_us:{user:1,system:1},resource_usage:{maxRSS:1},memory_usage:{rss:1}};
  const result={wasInterrupted:false,numTotalTestSuites:1,numTotalTests:3,numPendingTests:0,numPendingTestSuites:0,numRuntimeErrorTestSuites:0,
    numPassedTests:failed?2:3,numFailedTests:failed?1:0,success:!failed,numPassedTestSuites:failed?0:1,numFailedTestSuites:failed?1:0,
    testResults:[{name:'/repo/frontend/src/preview/frameworkFiveYear.test.js',assertionResults:cases.map(row=>({fullName:row.name,status:row.status,
      failureMessages:row.status==='failed'?['Exceeded timeout of 180000 ms for a test']:[]}))}]};
  const summary={...proof,complete:true,diagnostic_valid:true,errors:[],loaded_count:1,out_of_case_calls:0,
    loaded_source_sha256:'85547886be517c229959d413cea383c8e57987db39d13787f973b522b351a730',calibration,
    artifact_writes:{failed:0,count:8,includes_current_write:false,wall_ms:1},
    cases:raw.map(row=>({framework:row.framework,guards_preserved:true,call_count:1}))};
  const host={...proof,...runtime,exec_path:runtime.execPath,actual_jest_pid:4,profiler_enabled:false,gc_forced:false,max_calls:16384,max_depth:16,
    environment:{export_enabled:false,lifecycle_years:'5',CI:true}};
  const transform={...proof,source_sha256:summary.loaded_source_sha256,observed_source_sha:SHA,matches:1,
    actual_transform_pid:4,source_map_preserved:true,original_sources_content_preserved:true,target:'frontend/src/preview/portfolioReporting.js',
    generated_code_sha256:'c'.repeat(64),source_map_sha256:'c'.repeat(64),harness_sha256:'c'.repeat(64),stock_transform_sha256:'c'.repeat(64),
    native_route_sha256:'c'.repeat(64),native_factory_sha256:'c'.repeat(64),native_route:'@craco/craco/dist/lib/features/jest/jest-babel-transform',
    native_factory:'@craco/craco/dist/lib/features/jest/create-jest-babel-transform',config_control:{consumed_pairs:1,removed_argument_count:2,
      parsed_config_matches:true,other_arguments_unchanged:true,general_route_matches:true}};
  return {raw,summary,host,calibration,actual,result,execution,transform};
}
test('preflight rejects a retry, wrong actual runtime and contaminated workload flags',()=>{
  driver.verifyPreflight(runtime,env());
  assert.throws(()=>driver.verifyPreflight(runtime,{...env(),GITHUB_RUN_ATTEMPT:'2'}));
  assert.throws(()=>driver.verifyPreflight({...runtime,node:'v22.23.3'},env()));
  for(const key of ['NODE_OPTIONS','FRAMEWORK_LIFECYCLE_EXPORT_DIR','ISO_TWO_POINT_OUTPUT','REPORTING_PREP_LOG_DIR'])
    assert.throws(()=>driver.baseEnvironment({...env(),[key]:'unexpected'},'/tmp/output','/usr/bin/node','linux'));
  assert.throws(()=>driver.baseEnvironment({...env(),FRAMEWORK_LIFECYCLE_YEARS:'3'},'/tmp/output','/usr/bin/node','linux'));
});
test('arguments preserve original whole suite, setups and source while selecting only diagnostic config',()=>{
  const args=driver.diagnosticArguments('/repo/frontend','/tmp/out','/craco.js');
  assert.ok(args.includes('src/preview/frameworkFiveYear.test.js'));assert.ok(args.includes('--runInBand'));
  assert.ok(args.includes(path.join('/repo/frontend','src/setupTests.js')));assert.ok(args.includes('--config'));
  assert.ok(!args.some(value=>/testTimeout|testNamePattern|forceExit/.test(value)));
  assert.equal(driver.LIFECYCLE_BLOB,'f044a5166f02d5c5a7884a753b04ee23e5a0ea8c');
  assert.equal(driver.LIMITS.childMs,600000);assert.equal(driver.LIMITS.driverMs,720000);
});
test('complete original timeout remains a failed outcome with valid censored attribution',()=>{
  const f=fixture(true), result=driver.verifySequence(f.actual,f.result,f.execution,env(),runtime);
  assert.equal(result.original_tests_passed,false);assert.equal(result.censored_iso,true);assert.equal(result.predecessors_passed,true);
  f.result.testResults[0].assertionResults[2].failureMessages=['different failure'];
  assert.equal(driver.verifySequence(f.actual,f.result,f.execution,env(),runtime).iso_failure_outside_deadline,true);
  f.actual.cases.reverse();assert.throws(()=>driver.verifySequence(f.actual,f.result,f.execution,env(),runtime));
});
test('cost observation independently rejects missing binding, mismatched counts, caps and overhead refusal',()=>{
  const verify=f=>driver.verifyObserver(f.summary,f.raw,f.host,f.calibration,f.actual,env(),f.transform,'c'.repeat(64),
    {source_files:{approved_transform:{sha256:'c'.repeat(64)},babel_transform_factory:{sha256:'c'.repeat(64)}}});
  assert.equal(verify(fixture()).predecessors_settled,true);
  for(const change of [f=>f.summary.loaded_source_sha256='bad',f=>f.transform.matches=0,f=>f.raw[2].calls[0].e=99,
    f=>f.raw[2].totals.pending=1,f=>f.raw[2].stopped=true,f=>f.calibration.blocks[0].observed_ms=100,
    f=>f.raw[2].calls[0].p=1,f=>f.transform.actual_transform_pid=99,f=>f.transform.harness_sha256='d'.repeat(64),
    f=>f.transform.original_sources_content_preserved=false,f=>f.summary.loaded_count=2,f=>f.summary.out_of_case_calls=1,
    f=>f.transform.native_factory_sha256='d'.repeat(64),f=>f.transform.config_control.consumed_pairs=0]){const f=fixture();change(f);assert.throws(()=>verify(f));}
});
test('driver preserves a timeout and partial output after exactly one mocked child, never retrying',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'iso-summary-driver-')), frontend=path.join(temp,'app/frontend'), output=path.join(temp,'out');
  fs.mkdirSync(frontend,{recursive:true});let launches=0,configurations=0;
  try{
    const code=await driver.run(output,frontend,{environment:env(),runtime,prove:()=>({unchanged:true,
      harness_sha256:{'frontend/scripts/iso-pr110-summary-cost/transform.cjs':'c'.repeat(64)}}),argumentsFor:()=>['original'],
      construct:async args=>{configurations++;assert.ok(args.includes('--showConfig'));
        return {pid:2,status:0,signal:null,error:null,hard_failure:null,stdout:Buffer.from('{}'),stderr:Buffer.alloc(0)};},
      validateConfiguration:()=>({valid:true,source_files:{approved_transform:{sha256:'c'.repeat(64)},babel_transform_factory:{sha256:'c'.repeat(64)}}}),
      configurationArguments:(_frontend,diagnostic)=>['configuration','--showConfig',diagnostic?'diagnostic':'baseline'],
      launch:async(_args,_cwd,environment)=>{
        launches++;const f=fixture(true), folder=environment.ISO_SUMMARY_COST_OUTPUT;
        const files={'runtime.json':f.actual,'jest.json':f.result,'summary-cost-summary.json':f.summary,'summary-cost-host.json':f.host,
          'overhead-calibration.json':f.calibration,'transform-proof.json':f.transform};
        f.raw.forEach((row,i)=>files['summary-cost-case-'+String(i+1).padStart(2,'0')+'-'+row.framework+'.json']=row);
        for(const [name,value] of Object.entries(files))fs.writeFileSync(path.join(folder,name),JSON.stringify(value));
        return {...f.execution,stdout:Buffer.from('raw stdout'),stderr:Buffer.from('timeout original')};
      }});
    assert.equal(code,1);assert.equal(launches,1);assert.equal(configurations,2);
    const latest=JSON.parse(fs.readFileSync(path.join(output,'latest.json'),'utf8'));
    const receipt=JSON.parse(fs.readFileSync(path.join(latest.directory,'diagnostic-receipt.json'),'utf8'));
    assert.equal(receipt.capture_valid,true);assert.equal(receipt.outcome.censored_iso,true);assert.equal(receipt.passed,false);
    assert.equal(fs.readFileSync(path.join(latest.directory,'stderr.log'),'utf8'),'timeout original');
    await assert.rejects(()=>driver.run(output,frontend,{environment:env(),runtime}),/EEXIST/);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('failed actual configuration construction retains its evidence and never launches a lifecycle',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'iso-summary-config-')), frontend=path.join(temp,'app/frontend'), output=path.join(temp,'out');
  fs.mkdirSync(frontend,{recursive:true});let launches=0,configurations=0;
  try{
    const code=await driver.run(output,frontend,{environment:env(),runtime,prove:()=>({unchanged:true}),
      configurationArguments:()=>['configuration','--showConfig'],
      construct:async()=>{configurations++;return {pid:2,status:1,signal:null,error:null,hard_failure:null,
        stdout:Buffer.alloc(0),stderr:Buffer.from('real configuration failed')};},
      launch:async()=>{launches++;throw Error('must not launch');}});
    assert.equal(code,1);assert.equal(configurations,1);assert.equal(launches,0);
    const latest=JSON.parse(fs.readFileSync(path.join(output,'latest.json'),'utf8'));
    const receipt=JSON.parse(fs.readFileSync(path.join(latest.directory,'diagnostic-receipt.json'),'utf8'));
    assert.equal(receipt.workload_started,false);assert.match(receipt.stop_reason,/construction failed: baseline/);
    assert.equal(fs.readFileSync(path.join(latest.directory,'config-baseline-stderr.log'),'utf8'),'real configuration failed');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
