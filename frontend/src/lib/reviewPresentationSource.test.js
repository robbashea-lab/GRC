import {cis,activePlans,reviewDriver} from './frameworks';
import {resolveReviewPresentationSource,reviewCadenceComparison,reviewSourceQuoteSegments} from './reviewPresentationSource';

const client={client_id:'demo_brawndo'};
const plan=()=>activePlans('cis-ig1',{implementation_group:1}).find(item=>item.key==='account-authorization');
const review=()=>({client_id:client.client_id,review_id:'saved',title:'User Access Review',review_type:'access',baseline_key:'user-access',framework_key:'cis-ig1',framework_version:'8.1',framework_plan_key:'account-authorization',recurrence:'quarterly',framework_drivers:[reviewDriver('cis-ig1',plan())],governance_context:{category:'organizational',rationale:'Original management rationale'}});
const resolve=(record,options={})=>resolveReviewPresentationSource({record,client,...options});

test('a qualified actual 5.1 source takes precedence over retained organizational context without mutation',()=>{
  const record=review(),before=JSON.stringify(record),result=resolve(record);
  expect(result.classification).toBe('required');expect(result.primary.definition.id).toBe('5.1');
  expect(result.primary.quote).toBe(cis.requirements.find(item=>item.id==='5.1').official_text);
  expect(result.primary.quoteSegments.map(part=>part.text).join('')).toBe(result.primary.quote);
  expect(result.primary.quoteSegments.find(part=>part.highlight).text).toBe('on a recurring schedule at a minimum quarterly, or more frequently');
  expect(result.primary.version).toBe('8.1');expect(result.comparison.state).toBe('meets');
  expect(result.context.rationale).toBe('Original management rationale');expect(JSON.stringify(record)).toBe(before);
  expect(result.supports.flatMap(group=>group.requirements).some(item=>item.definition.id==='5.1')).toBe(false);
  expect(result.supports.flatMap(group=>group.requirements).some(item=>item.definition.id==='5.2')).toBe(true);
});

test('title alone never supplies a source and missing classification is not organization-defined',()=>{
  expect(resolve({client_id:client.client_id,title:'User Access Review'}).classification).toBe('unresolved');
  const {framework_key,framework_version,framework_plan_key,framework_drivers,...record}=review();
  expect(resolve(record).classification).toBe('organizational');
  expect(resolve({...review(),title:'Renamed native review'}).primary.definition.id).toBe('5.1');
});

test.each([
  {framework_driver_active:false},
  {framework_driver_active:undefined},
  {framework_version:undefined},
  {framework_version:'8.0'},
  {framework_plan_key:'unknown'},
  {framework_safeguards:['5.2','5.3']},
  {framework_cadence_references:[]},
  {framework_source_minimum:'annual'}
])('incomplete/inactive/mismatched driver fails closed: %j',patch=>{
  const record=review();record.framework_drivers=[{...record.framework_drivers[0],...patch}];
  expect(resolve(record).classification).toBe('unresolved');
});

test('same-client and current active source scope are required, related mappings alone are supporting',()=>{
  expect(resolve(review(),{client:{client_id:'other'}}).classification).toBe('unresolved');
  expect(resolve(review(),{activeDefinitionIds:['5.2']}).classification).toBe('unresolved');
  const result=resolve({client_id:client.client_id,governance_context:{category:'organizational'}},{related:{framework_assessments:[
    {client_id:client.client_id,framework_key:'cis-ig1',definition_id:'5.1'},
    {client_id:'other',framework_key:'cis-ig1',definition_id:'11.5'}
  ]}});
  expect(result.classification).toBe('organizational');expect(result.primary).toBeNull();
  expect(result.supports[0].requirements.map(item=>item.definition.id)).toEqual(['5.1']);
});

test('a higher-IG reference cannot become an IG1 primary source',()=>{
  const record=review();record.framework_drivers[0].framework_safeguards=['6.8'];
  expect(resolve(record).classification).toBe('unresolved');
});

test('a conflicting parent source version cannot be silently combined with a current driver',()=>{
  expect(resolve({...review(),framework_version:'8.0'}).classification).toBe('unresolved');
});

test.each([
  [{recurrence:'monthly'},'meets'],[{recurrence:'annual'},'below'],
  [{recurrence:'custom',custom_recurrence_days:90},'meets'],
  [{recurrence:'custom',custom_recurrence_days:91},'below'],
  [{recurrence:'custom',custom_recurrence_days:0},'not_comparable'],
  [{recurrence:'custom',custom_recurrence_days:'90'},'not_comparable'],
  [{recurrence:'custom',custom_recurrence_days:1.5},'not_comparable'],
  [{recurrence:'none'},'not_comparable'],[{recurrence:'weekly'},'not_comparable']
])('frequency comparison uses only native supported intervals: %j',(record,state)=>{
  expect(reviewCadenceComparison(record,'quarterly').state).toBe(state);
});

test('unrecorded source and quote text are never synthesized',()=>{
  expect(reviewCadenceComparison({recurrence:'monthly'},null).state).toBe('not_recorded');
  expect(reviewSourceQuoteSegments('Unchanged original source text.','quarterly')).toEqual([{text:'Unchanged original source text.',highlight:false}]);
});
