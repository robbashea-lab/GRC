import {BRAWNDO_CIS} from './brawndoProgram';
import {calendarRangeStart} from '../lib/portfolioProgress';
import {stable} from './commandRequests';
import {calendarDay} from '../lib/managementDates';

export const BRAWNDO_HISTORY_VERSION='brawndo-cis-ig1-history-v2';
export const BRAWNDO_HISTORY_CLIENT='demo_brawndo';
export const BRAWNDO_HISTORY_PROGRAM='demo_brawndo:cis-ig1';
export const SCENARIO_STATUSES=['addressed','in_progress','needs_attention','not_assessed'];
const DAY=86400000;
// Aggregate design targets are realized as exact per-item states below. They are
// illustrative scenario positions, never native assessment or audit records.
const TARGETS=[
  ['m',13,4,8,12],['m',12,4,8,12],['m',11,5,9,12],['m',10,6,10,12],
  ['m',9,8,11,12],['m',8,10,12,12],['m',7,12,13,12],['m',6,14,14,11],
  ['m',5,18,15,10],['m',4,22,15,9],['m',3,24,15,8],['d',90,24,15,8],
  ['d',75,25,15,8],['m',2,26,15,7],['d',60,26,15,7],['m',1,28,14,6],
  ['d',30,28,14,6],['d',14,30,13,6],['d',7,31,13,5],['d',0,32,12,5]
];
export const canonicalScenarioStates=()=>Object.fromEntries(Object.entries(BRAWNDO_CIS).map(([id,row])=>[id,row[0]]));
export const scenarioAssessmentId=id=>`fw_demo_brawndo_assessment_${id}`;

// Only this demo scenario's admission boundary is affected. Native date-only
// deadlines and the platform's existing timezone rules retain their semantics.
export function validScenarioInstant(value,clock=null){
  if(typeof value!=='string'||calendarDay(value)===null)return false;
  const parts=value.match(/^\d{4}-\d\d-\d\dT(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(?:Z|[+-](\d\d):(\d\d))$/);
  const instant=Date.parse(value);
  return !!parts&&Number(parts[1])<24&&Number(parts[2])<60&&Number(parts[3])<60
    &&Number(parts[4]||0)<24&&Number(parts[5]||0)<60&&Number.isFinite(instant)
    &&(clock===null||Number.isFinite(+clock)&&instant<=+clock);
}

export function buildBrawndoScenario(anchor,clock=new Date()){
  const anchorTime=Date.parse(anchor);
  if(!validScenarioInstant(anchor,clock))return null;
  const terminal=canonicalScenarioStates(),ids=Object.keys(terminal).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const at=new Date(anchorTime).toISOString();
  const targets=TARGETS.map(([unit,offset,...counts])=>({at:unit==='m'?calendarRangeStart(at,offset):new Date(anchorTime-offset*DAY).toISOString(),counts}));
  // calendarRangeStart intentionally accepts only product selector periods;
  // arbitrary scenario months use the same clamped UTC operation here.
  for(let i=0;i<TARGETS.length;i++)if(!targets[i].at){
    const date=new Date(at),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-TARGETS[i][1]);
    date.setUTCDate(Math.min(day,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));targets[i].at=date.toISOString();
  }
  targets.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const positions=[];
  for(const target of targets){
    const states={},remaining=new Set(ids);
    SCENARIO_STATUSES.slice(0,3).forEach((status,index)=>{
      // Terminal unassessed items stay unassessed throughout the scenario.
      const candidates=ids.filter(id=>remaining.has(id)&&terminal[id]!=='not_assessed')
        .sort((a,b)=>Number(terminal[b]===status)-Number(terminal[a]===status)||ids.indexOf(a)-ids.indexOf(b));
      for(const id of candidates.slice(0,target.counts[index])){states[id]=status;remaining.delete(id);}
    });
    for(const id of remaining)states[id]='not_assessed';
    const previous=positions.at(-1);
    if(previous?.at===target.at){if(stable(previous.states)!==stable(states))return null;continue;}
    positions.push({at:target.at,states:Object.fromEntries(ids.map(id=>[id,states[id]]))});
  }
  if(stable(positions.at(-1).states)!==stable(Object.fromEntries(ids.map(id=>[id,terminal[id]]))))return null;
  const payload=stable({version:BRAWNDO_HISTORY_VERSION,anchor:at,positions});
  // A compact deterministic identity, not an authorization or cryptographic
  // proof. Stored positions are also compared to the complete expected model.
  let first=2166136261,second=5381;
  for(const character of payload){first=Math.imul(first^character.charCodeAt(0),16777619);second=Math.imul(second,33)^character.charCodeAt(0);}
  const fingerprint=`scenario:${(first>>>0).toString(16)}:${(second>>>0).toString(16)}`;
  const events=[];let before=Object.fromEntries(ids.map(id=>[id,'not_assessed']));
  positions.forEach((position,index)=>{
    position.id=`demo-fixture:${BRAWNDO_HISTORY_VERSION}:${at}:${index}`;
    position.modeled_until=positions[index+1]?.at||at;
    for(const id of ids)if(position.states[id]!==before[id]&&position.states[id]!=='not_assessed')events.push({
      event_id:`${position.id}:${id}`,assessment_id:scenarioAssessmentId(id),definition_id:id,
      kind:position.states[id]==='addressed'?'implementation_transition':'assessment_review',
      before_status:before[id],status:position.states[id],effective_at:position.at,effective_date:position.at.slice(0,10),
      provenance:'demo_fixture',scenario_version:BRAWNDO_HISTORY_VERSION,scenario_anchor:at,
      client_id:BRAWNDO_HISTORY_CLIENT,framework_key:'cis-ig1'
    });
    before=position.states;
  });
  return {version:BRAWNDO_HISTORY_VERSION,anchor:at,fingerprint,terminal,positions,events};
}
