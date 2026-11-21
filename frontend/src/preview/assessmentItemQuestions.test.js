import {frameworkRequest} from './frameworks';
import {setupActivities} from './r4ServicesTools';
import {activeDefinitions} from '../lib/frameworks';
import {serviceCatalog} from '../lib/r4ServicesTools';
import {changeManualItem,withItemControls,knownGuidedItem} from './assessmentItems';

const copy=value=>JSON.parse(JSON.stringify(value));
const key='nist-csf-2',cid='synthetic_client_questions';
function fixture(){
  const client={client_id:cid,status:'active',profile:{services:{areas:Object.fromEntries(serviceCatalog.areas.map(area=>[area.id,{responsibility:'cl'}])),assessment_activities:{}}}};
  const db={user:{user_id:'synthetic-reader',role:'client_readonly',status:'active',client_ids:[cid]},clients:[client],reviews:[],requirements:[{client_id:cid,baseline_key:key,baseline_response:'applies'}],
    framework_assessments:activeDefinitions(key,{}).map((definition,index)=>({client_id:cid,framework_key:key,definition_id:definition.id,framework_assessment_id:'synthetic_assessment_'+index,items_to_address:[]}))};
  const activity=setupActivities(db,client).find(activity=>activity.drivers.some(driver=>driver.framework_key===key&&driver.framework_safeguards.length));
  expect(activity).toBeTruthy();
  const row=db.framework_assessments.find(row=>activity.drivers.some(driver=>driver.framework_safeguards.includes(row.definition_id)));
  client.profile.services.assessment_activities[row.framework_assessment_id]=activity.activity_id;
  row.items_to_address=[{item_id:'synthetic-saved-item',kind:'verification',state:'open',text:'SYNTHETIC Client must confirm actual ownership'}];
  return {db,row,client};
}

test('Client questions use complete saved responsibility bindings and never guess from one candidate',()=>{
  const {db,row,client}=fixture(),path='/frameworks/'+key+'/client-questions',before=copy(db);
  const result=frameworkRequest(db,path,'get',{client_id:cid},{});
  expect(result.questions).toEqual([expect.objectContaining({item_id:'synthetic-saved-item',assessment_id:row.framework_assessment_id,basis:expect.objectContaining({responsibility:'cl'})})]);
  expect(result.unconfirmed_count).toBe(0);expect(db).toEqual(before);
  delete client.profile.services.assessment_activities[row.framework_assessment_id];
  expect(frameworkRequest(db,path,'get',{client_id:cid},{})).toMatchObject({questions:[],unconfirmed_count:1});
  db.framework_assessments.push({...row,framework_assessment_id:'synthetic_duplicate'});
  expect(()=>frameworkRequest(db,path,'get',{client_id:cid},{})).toThrow('complete current program');
});

test('question reads retain tenant denial and incomplete-save feedback',()=>{
  const {db,row}=fixture(),path='/frameworks/'+key+'/client-questions';
  row._r4_context_pending='synthetic accepted command';
  expect(()=>frameworkRequest(db,path,'get',{client_id:cid},{})).toThrow('needs recovery');
  db.user.client_ids=[];expect(()=>frameworkRequest(db,path,'get',{client_id:cid},{})).toThrow('Forbidden');
});

test('genuine manual DTO controls leave stored data exact and malformed provenance grants no authority',()=>{
  const row={framework_assessment_id:'synthetic_assessment',framework_key:key,items_revision:0,items_to_address:[]};
  changeManualItem(row,{expected_revision:0,request_id:'synthetic_manual_request_01',item_type:'evidence',text:'SYNTHETIC actual evidence'},'synthetic-writer','2026-11-20T00:00:00Z');
  const before=copy(row),item=row.items_to_address[0];
  expect(withItemControls(row).item_controls[item.item_id]).toMatchObject({origin:'manual',can_remove:true,can_create_action:true});expect(row).toEqual(before);
  for(const fields of [{item_type:'gap'},{kind:'gap'},{history:[]}]){
    const retained={...row,items_to_address:[{...item,...fields}]};
    expect(withItemControls(retained).item_controls[item.item_id]).toEqual({origin:'unknown',can_remove:false,can_create_action:false,can_create_finding:false});
  }
  expect(knownGuidedItem(row,{item_id:'unknown',kind:'verification',source_fingerprint:'a'.repeat(64),question_id:['not-a-string'],source_version:{invalid:true}})).toBe(false);
});
