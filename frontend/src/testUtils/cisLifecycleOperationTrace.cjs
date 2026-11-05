'use strict';

const {performance}=require('node:perf_hooks');
// Module load precedes the test's fake timers. App clocks never measure spans.
const monotonicNow=performance.now.bind(performance);
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');
const MAX_ENTRIES=20000;
const METHODS=new Set(['GET','POST','PATCH','DELETE']);
const ROUTE_WORDS=new Set(('demo enter clients profile assignees onboarding baseline frameworks cis-ig1 iso-27001 soc-2 '
  +'framework_assessments reviews policies related risks accept close vendors assets links organizational-controls migrate '
  +'observations start evidence evidence-library items relationships create-finding tasks findings dashboard directory '
  +'complete validate programs users open_assignments calendar download configuration').split(' '));

function routeLabel(method,requestPath) {
  if(!METHODS.has(method)||typeof requestPath!=='string')throw new TypeError('Invalid trace API boundary');
  const segments=requestPath.split(/[?#]/,1)[0].split('/').filter(Boolean).slice(0,12);
  return method+' /'+segments.map(segment=>ROUTE_WORDS.has(segment)?segment:':id').join('/');
}
function unionWall(intervals) {
  const sorted=intervals.map(row=>[row.start_ms,row.end_ms]).sort((a,b)=>a[0]-b[0]);
  let total=0,start=null,end=null;
  for(const [left,right] of sorted) {
    if(start===null){start=left;end=right;}
    else if(left<=end)end=Math.max(end,right);
    else {total+=end-start;start=left;end=right;}
  }
  return start===null?0:total+end-start;
}
function summaries(spans,key) {
  const groups=new Map();
  for(const span of spans){const label=key(span);if(!groups.has(label))groups.set(label,[]);groups.get(label).push(span);}
  return Object.fromEntries([...groups].map(([label,rows])=>{
    const complete=rows.filter(row=>row.end_ms!==null);
    return [label,{completed_intervals_only:true,started:rows.length,completed:complete.length,incomplete:rows.length-complete.length,
      errors:rows.filter(row=>row.status==='error').length,
      inclusive_envelope_ms:complete.length?Math.max(...complete.map(row=>row.end_ms))-Math.min(...complete.map(row=>row.start_ms)):0,
      union_wall_ms:unionWall(complete)}];
  }));
}

function createLifecycleTrace({now=monotonicNow,limit=MAX_ENTRIES}={}) {
  if(typeof now!=='function'||!Number.isInteger(limit)||limit<1||limit>MAX_ENTRIES)throw new TypeError('Invalid trace bound');
  const origin=now(),cpuStart=process.cpuUsage(),resourceStart=process.resourceUsage();
  const spans=[],clocks=[];
  let phase='before_setup',fakeClock=null,nextId=0,overflow=false,dropped=0,finished=null,calibration=null;
  const elapsed=()=>now()-origin;
  const reserve=()=>{
    if(finished)return false;
    if(spans.length+clocks.length>=limit){overflow=true;dropped=Math.min(MAX_ENTRIES,dropped+1);return false;}
    return true;
  };
  function begin(kind,label) {
    if(!['phase','nativeAPI','nativeAPI_assertion','timer_flush','real_yield','sync','calibration'].includes(kind)
      ||typeof label!=='string'||!label.length||label.length>300)throw new TypeError('Invalid trace label');
    if(!reserve())return null;
    const span={id:++nextId,kind,label,phase,fake_clock:fakeClock,start_ms:elapsed(),end_ms:null,status:'incomplete'};
    spans.push(span);return span;
  }
  function end(span,status='ok') {
    if(finished||span===null)return;
    if(spans[span.id-1]!==span||span.end_ms!==null)throw new Error('Unknown or already ended trace span');
    if(!['ok','error','expected_rejection'].includes(status))throw new TypeError('Invalid trace status');
    span.end_ms=elapsed();span.status=status;
  }
  function calibrate(pairs=1000) {
    if(calibration||phase!=='before_setup'||pairs!==1000)throw new Error('Calibrate exactly once before setup');
    const samples=[],start=elapsed();
    for(let index=0;index<pairs;index++) {
      const before=elapsed(),span=begin('calibration','noop');end(span);samples.push(elapsed()-before);
    }
    const sorted=[...samples].sort((a,b)=>a-b);
    calibration={pairs,pair_envelope_total_ms:elapsed()-start,min_ms:sorted[0],median_ms:sorted[499],p95_ms:sorted[949],max_ms:sorted[999],
      interpretation:'Actual observer-only noop pairs; no app warmup, overhead subtraction, savings or JIT/GC claim.'};
    return calibration;
  }
  function finish(directory) {
    if(finished)return finished;
    const endMs=elapsed(),cpu=process.cpuUsage(cpuStart),resourceEnd=process.resourceUsage();
    finished={schema_version:1,diagnostic_only:true,monotonic_source:'node:perf_hooks captured before fake timers',
      window_ms:endMs,bound:limit,recorded_entries:spans.length+clocks.length,overflow,dropped_entries_capped:dropped,
      calibration,spans,clock_marks:clocks,
      by_phase:summaries(spans.filter(row=>row.kind!=='calibration'),row=>row.phase),
      by_operation:summaries(spans.filter(row=>row.kind!=='calibration'),row=>row.kind+' '+row.label),
      process_window:{cpu_user_microseconds:cpu.user,cpu_system_microseconds:cpu.system,
        resource_before:resourceStart,resource_at_finish:resourceEnd,
        limitation:'Observed process window includes calibration; excludes imports before collector creation and final trace encoding/IO. Whole-command GNU time is separate.'},
      limitations:['An unfinished span is not assigned a completion time. Late completions after finish are ignored.',
        'Inclusive envelopes and interval unions overlap across categories; never add them for attribution or savings.',
        'nativeAPI spans include the native request await envelope; they do not attribute codec, serialization, reporting or app internals.',
        'nativeAPI_assertion includes the original Jest assertion envelope.',
        'Observer overhead, JIT, GC and contention may affect the workload. No timeout-cutoff savings inference.']};
    if(directory!==undefined) {
      if(typeof directory!=='string'||!path.isAbsolute(directory))throw new TypeError('Trace output directory must be absolute');
      mkdirSync(directory,{recursive:true});
      writeFileSync(path.join(directory,'operation-trace.json'),JSON.stringify(finished,null,2)+'\n');
    }
    return finished;
  }
  return {begin,end,calibrate,finish,
    phase(value){if(!['setup','body','afterEach'].includes(value))throw new TypeError('Invalid phase');phase=value;},
    clock(value){
      if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))throw new TypeError('Invalid fake clock label');
      fakeClock=value;if(reserve())clocks.push({at_ms:elapsed(),phase,fake_clock:value});
    },
    beginAPI(method,requestPath,assertion=false){return begin(assertion?'nativeAPI_assertion':'nativeAPI',routeLabel(method.toUpperCase(),requestPath));}};
}

module.exports={createLifecycleTrace,routeLabel,unionWall,MAX_ENTRIES};
