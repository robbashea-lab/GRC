import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import iso from '@catalogs/iso27001.json';
import {buildLegacyDemoStore, ids} from '../store';
import {createDunderEightYearCandidate} from './dunderEightYearScenario';
import {DUNDER_ID as CID, EIGHT_YEAR_ANCHOR, EIGHT_YEAR_START, copy, fixtureId, assessmentAt} from './isoSocEightYearSupport';
import {demoCurrentPositions, compactPortfolioReporting, restorePortfolioReporting} from '../portfolioReporting';
import {lightweightStore, rememberFiles, restoreFiles, clearFileCache, fileBytes, payloadBytes} from '../evidenceStorage';
import {writeDemoStore, decodeDemoStore, MAX_DEMO_DECODE_BYTES} from '../demoStorageCodec';
import {auditProgress} from '../../lib/isoAudit';
import {aiScreening} from '../../lib/aiGovernance';
import {eligible, assignmentFields} from '../assignmentEligibility';
import {riskSnapshot} from '../risks';
import {restoredDunderDemoEvidence} from '../dunderDemoEvidence';

const clock=new Date(EIGHT_YEAR_ANCHOR),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const owned=(db,kind)=>db[kind].filter(row=>row.client_id===CID);
let source,sourceJson,db,backup,capacity;
beforeAll(()=>{
  jest.useFakeTimers({doNotFake:['performance']});jest.setSystemTime(clock);
  source=buildLegacyDemoStore(clock);sourceJson=JSON.stringify(source);
  ({db,backup}=createDunderEightYearCandidate(source,{clock}));
  const json=JSON.stringify(db);
  capacity={anchor:EIGHT_YEAR_ANCHOR,start:EIGHT_YEAR_START,raw_chars:json.length,raw_utf8_bytes:Buffer.byteLength(json),
    original_raw_ceiling:4000000,original_raw_ceiling_met:json.length<4000000,
    qualification:'Expanded fixture native-limit exception recorded in root CAPACITY-DECISION.md, 2026-11-02; quotas/formats/history/deadlines unchanged',
    sha256:hash(json),counts:Object.fromEntries(Object.keys(ids).filter(kind=>Array.isArray(db[kind])).map(kind=>[kind,owned(db,kind).length])),
    occurrences:owned(db,'reviews').reduce((n,row)=>n+row.occurrences.length,0),
    assessment_history:owned(db,'framework_assessments').reduce((n,row)=>n+row.assessment_history.length,0)};
  if(process.env.ISO_SOC_DUNDER_OUTPUT){
    fs.mkdirSync(process.env.ISO_SOC_DUNDER_OUTPUT,{recursive:true});
    fs.writeFileSync(path.join(process.env.ISO_SOC_DUNDER_OUTPUT,'DUNDER-CANDIDATE-SOURCE.json'),json);
    fs.writeFileSync(path.join(process.env.ISO_SOC_DUNDER_OUTPUT,'DUNDER-SOURCE-BACKUP.json'),sourceJson);
    fs.writeFileSync(path.join(process.env.ISO_SOC_DUNDER_OUTPUT,'DUNDER-CAPACITY.json'),JSON.stringify(capacity,null,2));
  }
});
afterAll(()=>{jest.useRealTimers();clearFileCache();});

test('replace only canonical Dunder with a recoverable source and preserve every existing account and foreign row',()=>{
  expect(JSON.stringify(source)).toBe(sourceJson);expect(JSON.stringify(backup)).toBe(sourceJson);
  for(const [kind,rows] of Object.entries(source))if(Array.isArray(rows)&&kind!=='users'){
    expect(db[kind].filter(row=>row.client_id!==CID)).toEqual(rows.filter(row=>row.client_id!==CID));
  }
  for(const user of source.users)expect(db.users.find(row=>row.user_id===user.user_id)).toEqual(user);
  expect(db.users.filter(row=>!source.users.some(old=>old.user_id===row.user_id))).toHaveLength(3);
  for(const user of db.users.filter(row=>!source.users.some(old=>old.user_id===row.user_id))){
    expect(user.status).toBe('disabled');expect(user.client_ids).toEqual([CID]);
  }
  for(const contact of source.contacts)expect(db.contacts.find(row=>row.contact_id===contact.contact_id)).toEqual(contact);
  expect(db.clients).toHaveLength(source.clients.length);
  const before=source.clients.find(row=>row.client_id===CID),after=db.clients.find(row=>row.client_id===CID);
  for(const field of ['name','logo_url','logo','client_id','primary_contact_id','assigned_owner_id'])expect(after[field]).toEqual(before[field]);
  expect(after.onboarding_baseline).toEqual(db.baselines[CID]);expect(after.onboarding_baseline.completed).toBe(true);
  const foreign=point=>(point.client_id||point.program_id?.split(':')[0])!==CID;
  for(const field of ['snapshots','identities','scope_events'])expect((db.portfolio_reporting[field]||[]).filter(foreign)).toEqual((source.portfolio_reporting[field]||[]).filter(foreign));
  const visitor=copy(db);visitor.clients.find(row=>row.client_id===CID).notes='Visitor edit retained';
  const again=createDunderEightYearCandidate(visitor,{clock});expect(again.installed).toBe(false);expect(again.db).toBe(visitor);
  expect(again.db.clients.find(row=>row.client_id===CID).notes).toBe('Visitor edit retained');
});

test('native ISO counts and saved histories support 100 percent without duplicate implementations or retroactive catalog claims',()=>{
  const rows=owned(db,'framework_assessments');expect(rows).toHaveLength(123);
  expect(rows.map(row=>row.definition_id).sort()).toEqual(iso.requirements.map(row=>row.id).sort());
  expect(rows.filter(row=>row.soa_applicability==='excluded').map(row=>row.definition_id).sort()).toEqual(['A.8.28','A.8.4']);
  for(const row of rows){
    expect(row.implementation.length).toBeGreaterThan(80);expect(row.owner_id).toBeTruthy();
    expect(row.framework_version).toBe('2022 + Amd 1:2024');
    expect(row.assessment_history).toHaveLength(4);
    for(const event of row.assessment_history){expect(event.at>='2024-02-23').toBe(true);expect(event.at<=EIGHT_YEAR_ANCHOR).toBe(true);}
    expect(row.status).toBe(row.soa_applicability==='excluded'?'not_applicable':'addressed');
  }
  const position=demoCurrentPositions(db,db.clients.filter(row=>row.client_id===CID),EIGHT_YEAR_ANCHOR)[0];
  expect(position.current).toMatchObject({implemented:121,denominator:121,excluded:2,percentage:100,scope_undetermined:0,availability:'available'});
  const history=db.portfolio_reporting.snapshots.filter(row=>row.client_id===CID);
  expect(history).toHaveLength(2); // Native capture records actual changed states; reaffirmations do not invent new trends.
  expect(history[0].current.percentage).toBeLessThan(100);expect(history.at(-1).current.percentage).toBe(100);
  for(const review of owned(db,'reviews'))for(const occurrence of review.occurrences){
    if(occurrence.completed_at<'2024-02-23')expect(occurrence.framework_key).not.toBe('iso-27001');
    if(occurrence.iso_soa_snapshot){
      expect(occurrence.iso_soa_snapshot.assessments).toHaveLength(93);
      for(const saved of occurrence.iso_soa_snapshot.assessments){expect(saved.assessment_history).toBeUndefined();expect(saved.last_saved<=occurrence.completed_at).toBe(true);expect(saved.updated_at<=occurrence.completed_at).toBe(true);}
    }
  }
  const soa=owned(db,'reviews').find(row=>row.framework_plan_key==='iso-soa-review'),frozen=JSON.stringify(soa.occurrences[0]);
  const clone=copy(db);clone.framework_assessments.find(row=>row.client_id===CID&&row.definition_id==='A.8.13').implementation='Visitor changes current text';
  expect(JSON.stringify(clone.reviews.find(row=>row.review_id===soa.review_id).occurrences[0])).toBe(frozen);
  expect(assessmentAt(rows.find(row=>row.definition_id==='A.8.13'),'2024-03-18').status).toBe('in_progress');
});

test('eight elapsed years retain original deadlines, late completions, actors, lifecycle separation and all audit workpapers',()=>{
  const reviews=owned(db,'reviews'),occurrences=reviews.flatMap(row=>row.occurrences);
  expect(occurrences.some(row=>row.completed_at===EIGHT_YEAR_START)).toBe(true);
  expect(new Set(occurrences.map(row=>row.completed_at.slice(0,4))).size).toBe(9);
  for(const review of reviews){
    if(review.status==='cancelled'){expect(review.cancelled_at<=EIGHT_YEAR_ANCHOR).toBe(true);expect(review.updated_at>=review.cancelled_at).toBe(true);}
    for(const occurrence of review.occurrences){
      expect(occurrence.occurrences).toBeUndefined();expect(occurrence.completed_at>=EIGHT_YEAR_START&&occurrence.completed_at<=EIGHT_YEAR_ANCHOR).toBe(true);
      expect(db.users.some(row=>row.user_id===occurrence.completed_by)).toBe(true);
      expect(occurrence.created_at<=occurrence.completed_at&&occurrence.updated_at<=occurrence.completed_at).toBe(true);
      for(const reference of occurrence.evidence){const evidence=db.evidence.find(row=>row.evidence_id===reference.evidence_id);expect(evidence.client_id).toBe(CID);expect(evidence.created_at<=occurrence.completed_at).toBe(true);}
      if(occurrence.iso_audit)expect(auditProgress(occurrence.iso_audit).complete).toBe(auditProgress(occurrence.iso_audit).total);
    }
  }
  const late=occurrences.find(row=>row.due_date==='2022-01-15'&&row.review_id===fixtureId('review','historical-access'));
  expect(late.completed_at).toBe('2022-04-08T00:00:00.000Z');expect(late.due_date).toBe('2022-01-15');
  const audits=reviews.filter(row=>row.iso_audit);expect(audits).toHaveLength(4);expect(audits.flatMap(row=>row.occurrences)).toHaveLength(12);
  for(const finding of owned(db,'findings')){
    const task=db.tasks.find(row=>row.task_id===finding.primary_task_id);
    if(finding.status==='closed'){
      expect(task.status).toBe('done');expect(task.completed_at<finding.validated_at).toBe(true);
      expect(finding.validated_at).toBe(finding.closed_at);expect(finding.decision_history.at(-1).action).toBe('validated');
    }else{
      expect(finding).toMatchObject({status:'in_remediation',severity:'low'});
      expect(finding.framework_assessment_id).toBeUndefined();expect(finding.validated_at).toBeUndefined();expect(task.status).toBe('open');
      expect(finding.description).toContain('not a missing mandatory ISO implementation control');
    }
    if(finding.occurrence_id)expect(db.reviews.find(row=>row.review_id===finding.review_id).occurrences.some(row=>row.occurrence_id===finding.occurrence_id)).toBe(true);
  }
  const wms=owned(db,'findings').find(row=>row.finding_id===fixtureId('finding','wms-dependency'));
  expect(wms.risk_id).toBe(fixtureId('risk','wms-dependency'));
  expect(db.risks.find(row=>row.risk_id===wms.risk_id).related_links).toContainEqual({kind:'findings',id:wms.finding_id});
  const management=reviews.find(row=>row.framework_plan_key==='iso-management-review');
  const objectives=reviews.find(row=>row.framework_plan_key==='iso-objective-review');
  for(const review of [management,objectives])for(const occurrence of review.occurrences){
    expect(occurrence.notes).toContain('Targets:');expect(occurrence.notes).toContain(occurrence.completed_at.slice(0,4)+' retained results:');
    expect(occurrence.conclusion).toBe(occurrence.notes);
    if(occurrence.completed_at<'2026-01-01')expect(occurrence.notes).not.toContain('3h 32m');
  }
});

test('register populations and native relationships remain same-client and current owners retain native eligibility',()=>{
  expect(owned(db,'risks')).toHaveLength(28);expect(owned(db,'vendors')).toHaveLength(22);expect(owned(db,'ai_systems')).toHaveLength(4);
  expect(db.ai_intake[CID]).toEqual({client_id:CID,usage:'yes',indicators:['Third-party AI tools internally'],updated_at:EIGHT_YEAR_ANCHOR});
  const declaration=owned(db,'logs').filter(row=>row.action==='AI intake updated');
  expect(declaration).toHaveLength(1);
  expect(declaration[0]).toMatchObject({audit_id:fixtureId('log','ai-intake'),at:EIGHT_YEAR_ANCHOR,user_id:source.user.user_id,
    meta:{simulated:true,source:'Fictional Dunder organization AI-use declaration through the native intake service'}});
  expect(Object.fromEntries(Object.entries(db.ai_intake).filter(([id])=>id!==CID)))
    .toEqual(Object.fromEntries(Object.entries(source.ai_intake||{}).filter(([id])=>id!==CID)));
  const riskCounts=Object.fromEntries(['closed','accepted','in_progress','assessed'].map(status=>[status,owned(db,'risks').filter(row=>row.status===status).length]));
  expect(riskCounts).toEqual({closed:6,accepted:5,in_progress:8,assessed:9});
  for(const [kind,key] of Object.entries(ids))if(db[kind]){
    const nativeIds=db[kind].map(row=>row[key]);expect(new Set(nativeIds).size).toBe(nativeIds.length);
    for(const row of owned(db,kind)){
      for(const field of assignmentFields[kind]||[])if(row[field])expect(eligible(db.users.find(user=>user.user_id===row[field]),CID)).toBe(true);
      for(const link of row.related_links||[]){const target=db[link.kind]?.find(item=>item[ids[link.kind]]===link.id);expect(target?.client_id).toBe(CID);}
      for(const [field,targetKind] of Object.entries({review_id:'reviews',finding_id:'findings',risk_id:'risks',vendor_id:'vendors',policy_id:'policies',ai_system_id:'ai_systems',framework_assessment_id:'framework_assessments'}))if(row[field]&&field!==ids[kind])expect(db[targetKind].find(item=>item[ids[targetKind]]===row[field])?.client_id).toBe(CID);
    }
  }
  for(const ai of owned(db,'ai_systems')){
    expect(aiScreening(ai).screening_complete).toBe(true);expect(ai.approval_status).toBeUndefined();
    expect(ai.related_links.filter(link=>link.kind==='risks')).toHaveLength(1);
    expect(owned(db,'reviews').some(row=>row.ai_system_id===ai.ai_system_id&&row.recurrence==='annual')).toBe(true);
  }
  for(const review of owned(db,'reviews').filter(row=>row.risk_id))for(const occurrence of review.occurrences){
    expect(Object.keys(occurrence.risk_before).sort()).toEqual(Object.keys(riskSnapshot({})).sort());
    expect(occurrence.outcome).toBe('Reviewed — No Change');
    if(occurrence.completed_at<'2026-10-16'){expect(occurrence.risk_before.acceptance_date).toBeNull();}
  }
  for(const policy of owned(db,'policies').filter(row=>row.status==='approved')){
    expect(policy.approval_history.filter(entry=>entry.action==='approved')).toHaveLength(3);
    const first=policy.approval_history[0].subject;expect(first.version).toBe('1.0');expect(first.summary).not.toMatch(/Microsoft 365|AI inputs|immutable retention/i);
    for(const event of policy.review_history)expect(policy.approval_history.some(entry=>entry.subject.subject_id===event.subject_id&&entry.at<=event.completed_at)).toBe(true);
  }
});

test.each(['yes','no','unsure'])('retained visitor AI declaration %s is not reinstalled by the fresh-source builder',usage=>{
  const visitor=copy(db),declaration={client_id:CID,usage,indicators:usage==='yes'?['Third-party AI tools internally']:[],updated_at:'2026-11-03T12:00:00.000Z'};
  visitor.ai_intake[CID]=declaration;
  const logs=JSON.stringify(visitor.logs);
  const result=createDunderEightYearCandidate(visitor,{clock});
  expect(result.installed).toBe(false);expect(result.db).toBe(visitor);
  expect(result.db.ai_intake[CID]).toBe(declaration);expect(JSON.stringify(result.db.logs)).toBe(logs);
});

test.each(['invalid intake map','retained audit collision'])('fresh AI declaration rejects %s without changing the source',mode=>{
  const invalid=copy(source);
  if(mode==='invalid intake map')invalid.ai_intake=[];
  else invalid.logs.push({audit_id:fixtureId('log','ai-intake'),client_id:'demo_prestige',action:'Retained foreign event',at:EIGHT_YEAR_START});
  const before=JSON.stringify(invalid);
  expect(()=>createDunderEightYearCandidate(invalid,{clock})).toThrow(/AI intake/);
  expect(JSON.stringify(invalid)).toBe(before);
});

test('existing native serializer roundtrips complete records under unchanged physical and decoded budgets',()=>{
  const packed=compactPortfolioReporting(lightweightStore(db,source.evidence));
  const json=JSON.stringify(packed);let saved;
  const storage={setItem(_key,value){if(value.length*2>5*1024*1024)throw Object.assign(new Error('Controlled 5 MiB budget'),{name:'QuotaExceededError'});saved=value;}};
  writeDemoStore(storage,'fixture',json);expect(Buffer.byteLength(json)).toBeLessThanOrEqual(MAX_DEMO_DECODE_BYTES);
  const decoded=decodeDemoStore(saved);expect(decoded).toEqual(packed);
  rememberFiles(db,packed);const restored=restoreFiles(restorePortfolioReporting(copy(decoded)));
  expect(restored.reviews).toEqual(db.reviews);expect(restored.framework_assessments).toEqual(db.framework_assessments);
  for(const evidence of owned(db,'evidence')){
    expect(fileBytes(evidence.content_base64)).toBe(evidence.size);expect(evidence.size).toBeLessThanOrEqual(16*1024);
    expect(restored.evidence.find(row=>row.evidence_id===evidence.evidence_id).content_base64).toBe(evidence.content_base64);
  }
  clearFileCache();const cold=restoreFiles(restorePortfolioReporting(copy(decoded)));
  const unavailable=owned(db,'evidence').filter(row=>{
    const savedRow=cold.evidence.find(item=>item.evidence_id===row.evidence_id);
    const response=restoredDunderDemoEvidence(cold,savedRow)||savedRow;
    return response.content_base64!==row.content_base64;
  });
  Object.assign(capacity,{packed_utf8_bytes:Buffer.byteLength(json),stored_utf16_bytes:saved.length*2,
    inline_payload_utf16_bytes:decoded.evidence.reduce((n,row)=>n+payloadBytes(row.content_base64),0),
    new_file_count:owned(db,'evidence').length,new_file_decoded_bytes:owned(db,'evidence').reduce((n,row)=>n+row.size,0),
    unavailable_after_cache_loss:unavailable.map(row=>({evidence_id:row.evidence_id,filename:row.filename,sha256:hash(Buffer.from(row.content_base64,'base64'))}))});
  if(process.env.ISO_SOC_DUNDER_OUTPUT)fs.writeFileSync(path.join(process.env.ISO_SOC_DUNDER_OUTPUT,'DUNDER-CAPACITY.json'),JSON.stringify(capacity,null,2));
  expect(capacity.inline_payload_utf16_bytes).toBeLessThanOrEqual(64*1024);
  expect(saved.length*2).toBeLessThanOrEqual(5*1024*1024);
});

test('new fixture Evidence remains downloadable after actual native file-cache loss',()=>{
  expect(owned(db,'evidence')).toHaveLength(32);
  expect(Object.keys(db.dunder_demo_artifacts.artifacts)).toHaveLength(32);
  expect(capacity.unavailable_after_cache_loss).toEqual([]);
});
