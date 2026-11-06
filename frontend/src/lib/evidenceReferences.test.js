import api from './api';
import {FRAMEWORKS,frameworkDefinition} from './frameworks';
import {sourceReference} from './evidenceReferences';
import {resolveEvidenceSource} from './evidenceContext';
import {evidencePage,evidenceReferences,evidenceLibraryRequest} from '../preview/evidence';

const copy = value => JSON.parse(JSON.stringify(value));

function fixture(group=3,definition=group===3?'1.5':'1.1') {
  const cid='synthetic_scope_'+group, foreign='synthetic_other';
  const user={user_id:'synthetic_reader',role:'client_contributor',name:'Fictional reader',client_ids:[cid]};
  const assessment={client_id:cid,framework_assessment_id:'opaque:assessment/'+group,
    framework_key:'cis-ig1',framework_version:'8.1',definition_id:definition,status:'addressed',related_links:[]};
  const foreignAssessment={...assessment,client_id:foreign,framework_assessment_id:'foreign:assessment',definition_id:'1.1'};
  const file=(id,extra)=>({evidence_id:id,client_id:cid,filename:id+'.csv',mime_type:'text/csv',size:4,
    content_base64:'VEVTVA==',evidence_type:'Report',created_at:'2026-11-05T00:00:00.000Z',
    uploaded_by:user.user_id,relationships:[],...extra});
  const policy={client_id:cid,policy_id:'native-policy',title:'Synthetic supporting policy',status:'approved'};
  const db={user,users:[user],clients:[{client_id:cid,framework_settings:{'cis-ig1':{implementation_group:group}}},
    {client_id:foreign,framework_settings:{'cis-ig1':{implementation_group:1}}}],
    framework_assessments:[assessment,foreignAssessment],policies:[policy],vendors:[],reviews:[],findings:[],
    tasks:[],organizational_controls:[],logs:[],
    evidence:[file('primary-proof',{linked_type:'framework_assessment',linked_id:assessment.framework_assessment_id}),
      file('supporting-proof',{linked_type:'policy',linked_id:policy.policy_id,
        relationships:[{kind:'framework_assessments',id:assessment.framework_assessment_id}]})]};
  return {db,cid,foreign,assessment,foreignAssessment};
}
afterEach(()=>jest.restoreAllMocks());

test('the shared CIS key does not label a baseline or IG3-only safeguard as an IG1 program',()=>{
  for(const definition of ['1.1','1.5']){
    const row=fixture(3,definition).assessment,before=copy(row),ref=sourceReference('framework_assessments',row);
    expect(ref.title).toBe(`CIS ${definition} · ${frameworkDefinition('cis-ig1',definition).title}`);
    expect(ref.title).not.toContain('CIS IG1');
    expect(ref).toMatchObject({kind:'framework_assessments',id:row.framework_assessment_id,framework_key:'cis-ig1',available:true});
    expect(row).toEqual(before);
  }
  expect(frameworkDefinition('cis-ig1','1.5').implementation_group).toBe(3);
});

test.each([1,2,3])('IG%s primary and supporting catalog references keep actual source identity and stored data',group=>{
  const {db,cid,assessment}=fixture(group),before=copy(db);
  const result=evidencePage(db,{client_id:cid,today:'2026-11-05'});
  expect(result.total).toBe(2);
  const primary=result.items.find(row=>row.evidence_id==='primary-proof');
  const supporting=result.items.find(row=>row.evidence_id==='supporting-proof');
  const expected=`CIS ${assessment.definition_id} · ${frameworkDefinition('cis-ig1',assessment.definition_id).title}`;
  expect(primary.context.source).toMatchObject({kind:'framework_assessments',id:assessment.framework_assessment_id,title:expected,available:true});
  expect(supporting.context.source.title).toBe('Synthetic supporting policy');
  expect(supporting.references.find(ref=>ref.kind==='framework_assessments'))
    .toMatchObject({id:assessment.framework_assessment_id,title:expected,origin:'supporting',available:true});
  expect(result.folder_counts.find(folder=>folder.area==='Frameworks')).toMatchObject({key:'cis-ig1',path:JSON.stringify(['Frameworks','cis-ig1'])});
  expect(db).toEqual(before);
});

test('the actual source picker uses the same corrected label and only the authorized client records',()=>{
  const {db,cid,foreign,assessment}=fixture(),before=copy(db);
  const result=evidenceLibraryRequest(db,'get',['evidence-library','sources'],{client_id:cid,kind:'framework_assessments',q:'1.5'},{});
  expect(result.total).toBe(1);
  expect(result.items[0]).toMatchObject({kind:'framework_assessments',id:assessment.framework_assessment_id,framework_key:'cis-ig1',available:true});
  expect(result.items[0].title).toBe(`CIS 1.5 · ${frameworkDefinition('cis-ig1','1.5').title}`);
  expect(()=>evidenceLibraryRequest(db,'get',['evidence-library','sources'],{client_id:foreign,kind:'framework_assessments'},{})).toThrow('Forbidden');
  expect(db).toEqual(before);
});

test('a foreign supporting identity remains unavailable instead of becoming a labeled cross-client target',()=>{
  const {db,foreignAssessment}=fixture();
  db.evidence[1].relationships=[{kind:'framework_assessments',id:foreignAssessment.framework_assessment_id}];
  const before=copy(db),ref=evidenceReferences(db,db.evidence[1]).find(row=>row.kind==='framework_assessments');
  expect(ref).toMatchObject({id:foreignAssessment.framework_assessment_id,available:false,title:'Source unavailable'});
  expect(db).toEqual(before);
});

test.each(['iso-27001','soc-2','hipaa'])('%s retains its existing framework label and native record identity',framework=>{
  const row={framework_assessment_id:'opaque-other',client_id:'synthetic',framework_key:framework,definition_id:'retained-definition',status:'not_assessed'};
  const before=copy(row),ref=sourceReference('framework_assessments',row);
  expect(ref.title).toBe(`${FRAMEWORKS.find(item=>item.key===framework).label} retained-definition · retained-definition`);
  expect(ref.id).toBe(row.framework_assessment_id);expect(ref.framework_key).toBe(framework);expect(row).toEqual(before);
});

test('unknown framework and non-framework source fallback labels remain unchanged',()=>{
  expect(sourceReference('framework_assessments',{framework_assessment_id:'opaque',framework_key:'other-native',definition_id:'x'}).title)
    .toBe('other-native x · x');
  expect(sourceReference('policies',{policy_id:'policy-id',title:'Keep this exact native title'}))
    .toMatchObject({id:'policy-id',title:'Keep this exact native title',label:'Policy'});
});

test('opening the corrected reference resolves the exact encoded native ID without changing the destination',async()=>{
  const {assessment,cid}=fixture(),ref=sourceReference('framework_assessments',assessment);
  const read=jest.spyOn(api,'get').mockResolvedValue({data:assessment});
  const target=await resolveEvidenceSource(ref,cid);
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith('/framework_assessments/'+encodeURIComponent(assessment.framework_assessment_id));
  expect(target.kind).toBe('framework_assessments');expect(target.record).toBe(assessment);expect(target.initialValues).toEqual({});
});

test('the existing same-client resolution guard still rejects a foreign record returned for that ID',async()=>{
  const {assessment,cid,foreignAssessment}=fixture(),ref=sourceReference('framework_assessments',assessment);
  const read=jest.spyOn(api,'get').mockResolvedValue({data:foreignAssessment});
  await expect(resolveEvidenceSource(ref,cid)).rejects.toThrow('Source not found for this client');
  expect(read).toHaveBeenCalledWith('/framework_assessments/'+encodeURIComponent(assessment.framework_assessment_id));
});

test('unavailable references preserve the original identity and cannot start a source read',async()=>{
  const ref=sourceReference('framework_assessments',null,'retained-missing-id');
  expect(ref).toMatchObject({id:'retained-missing-id',available:false,title:'Source unavailable'});
  const read=jest.spyOn(api,'get').mockRejectedValue(new Error('Unexpected unavailable source read'));
  await expect(resolveEvidenceSource(ref,'synthetic')).rejects.toThrow('Source unavailable');
  expect(read).not.toHaveBeenCalled();
});
