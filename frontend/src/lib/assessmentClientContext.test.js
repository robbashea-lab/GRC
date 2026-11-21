import {assessmentClientRecords,configuredAssessmentTools,contextIdentityMatches} from './assessmentClientContext';
const record={client_id:'new-client',framework_assessment_id:'assess-one',framework_key:'soc-2',definition_id:'CC6.1'};
function services(){return {client_id:record.client_id,candidates:[{activity_id:'native-access',title:'Access Review',area_ids:['identity'],area_id:'identity'}],
  catalog:[{tool_id:'identity-tool',name:'Saved identity platform',area_ids:['identity']},{tool_id:'endpoint-tool',name:'Unrelated endpoint agent',area_ids:['endpoint']}],
  services:{areas:{identity:{tool_ids:['identity-tool'],responsibility:'co'},endpoint:{tool_ids:['endpoint-tool'],responsibility:'iv'}},custom_tools:[]}};}
test('configured tools use the same specific activity service areas and stable IDs, never generic governance fallback',()=>{
  const data=services(),before=JSON.stringify(data);
  expect(configuredAssessmentTools(data).map(tool=>tool.tool_id)).toEqual(['identity-tool']);
  data.candidates=[{area_id:'governance'}];expect(configuredAssessmentTools(data)).toEqual([]);
  data.candidates=[{area_ids:['identity','identity']}];expect(configuredAssessmentTools(data)).toHaveLength(1);
  data.candidates=[{activity_id:'native-access',title:'Access Review',area_ids:['identity'],area_id:'identity'}];
  expect(JSON.stringify(data)).toBe(before);
});
test('client, assessment and framework identity must match; shared numeric definitions cannot cross programs',()=>{
  for(const field of ['client_id','framework_assessment_id','framework_key','definition_id']) {
    const source={record:{...record,[field]:'other'}};
    expect(contextIdentityMatches(record,source.record)).toBe(false);
    expect(assessmentClientRecords(record,source,services())).toEqual([]);
  }
});
test('read-only references preserve current server policy selection/status/version and exclude foreign records',()=>{
  const source={record,related:{policies:[{client_id:record.client_id,policy_id:'replacement',title:'Renamed policy',version:'3',status:'draft'},
    {client_id:'foreign',policy_id:'old',title:'Foreign policy'}],reviews:[{client_id:record.client_id,review_id:'native-review',title:'Access Review',status:'scheduled'}],ai_systems:[{client_id:record.client_id,ai_system_id:'native-ai',name:'Current AI subject',status:'draft'}]}};
  const before=JSON.stringify(source),rows=assessmentClientRecords(record,source,services());
  expect(rows.find(row=>row.kind==='Policy')).toMatchObject({id:'replacement',title:'Renamed policy',status:'Draft',metadata:'Version 3'});
  expect(rows.some(row=>row.id==='old')).toBe(false);
  expect(rows.find(row=>row.id==='native-ai')).toMatchObject({kind:'AI system',title:'Current AI subject'});
  expect(rows.some(row=>row.id==='identity-tool')).toBe(true);
  source.related.policies=[];expect(assessmentClientRecords(record,source,services()).filter(row=>row.kind==='Policy')).toEqual([]);
  source.related.policies=JSON.parse(before).related.policies;expect(JSON.stringify(source)).toBe(before);
  expect(assessmentClientRecords(record,source,{...services(),client_id:'foreign'}).some(row=>row.kind==='Tool')).toBe(false);
});
test('a Review identity without a saved next date remains honestly unscheduled',()=>{
  const data=services(),source={record,related:{}};
  data.candidates[0].review_id='review-without-date';data.candidates[0].first_next_due='';
  expect(assessmentClientRecords(record,source,data).find(row=>row.kind==='Recurring activity').status).toBe('Not scheduled');
  data.candidates[0].first_next_due='2027-01-30';
  expect(assessmentClientRecords(record,source,data).find(row=>row.kind==='Recurring activity').status).toBe('Scheduled');
});
test('Policy context preserves native approval qualification instead of endorsing legacy display status',()=>{
  const policy={client_id:record.client_id,policy_id:'legacy-unverified',title:'Legacy stated approval',status:'approved'};
  const source={record,related:{policies:[policy]}};
  expect(assessmentClientRecords(record,source,services()).find(row=>row.kind==='Policy').status).toBe('Needs Confirmation');
  policy.approved_at='2026-11-20T12:00:00Z';
  expect(assessmentClientRecords(record,source,services()).find(row=>row.kind==='Policy').status).toBe('Approved');
});