import {safeguardDateFooter} from './brawndoSafeguardDates';

const record=()=>({client_id:'demo_brawndo',framework_key:'cis-ig1',framework_assessment_id:'native-1.1',definition_id:'1.1',status:'addressed',last_saved:'2026-10-18T09:06:07Z'});
const metadata=()=>({client_id:'demo_brawndo',framework_key:'cis-ig1',assessment_id:'native-1.1',definition_id:'1.1',status:'addressed',before_status:'in_progress',kind:'implementation_transition',effective_date:'2026-09-30',provenance:'demo_fixture',scenario_version:'brawndo-cis-ig1-history-v2',scenario_anchor:'2026-10-18T00:00:00Z',event_id:'scenario-1.1-completed'});

test('explicit matching completion date remains a calendar date and never changes the native save',()=>{
  const row={...record(),demo_date_metadata:metadata()},before=JSON.stringify(row);
  expect(safeguardDateFooter(row)).toEqual({label:'Completed on',dateTime:'2026-09-30',display:'Sep 30, 2026',provenance:'demo_fixture'});
  expect(JSON.stringify(row)).toBe(before);
});

test('review metadata applies only to the exact partial/nonimplemented current status',()=>{
  for(const status of ['in_progress','needs_attention']){
    const row={...record(),status,demo_date_metadata:{...metadata(),status,kind:'assessment_review'}};
    expect(safeguardDateFooter(row).label).toBe('Assessment reviewed on');
  }
});

test.each([
  {client_id:'other'},{framework_key:'soc-2'},{assessment_id:'other'},{definition_id:'2.1'},
  {status:'in_progress'},{provenance:'committed_event'},{scenario_version:'unknown'},
  {scenario_anchor:'2026-02-30T00:00:00Z'},{scenario_anchor:'2026-10-18'},
  {event_id:''},{effective_date:'2026-02-30'},{effective_date:'2026-09-30T00:00:00Z'},
  {before_status:'addressed'},{kind:'assessment_review'},
])('invalid/stale scenario metadata %j falls back to confirmed native save',change=>{
  expect(safeguardDateFooter({...record(),demo_date_metadata:{...metadata(),...change}})).toMatchObject({label:'Last saved:',dateTime:'2026-10-18T09:06:07.000Z'});
});

test('regression cannot retain a previous implemented episode and later accepted transition can replace it',()=>{
  const row={...record(),status:'needs_attention',demo_date_metadata:metadata()};
  expect(safeguardDateFooter(row).label).toBe('Last saved:');
  const completed={...record(),demo_date_metadata:{...metadata(),provenance:'accepted_native',effective_date:'2026-10-18',event_id:'native-transition-2'}};
  expect(safeguardDateFooter(completed)).toMatchObject({label:'Completed on',dateTime:'2026-10-18',provenance:'accepted_native'});
});

test('last assessed and isolated native history do not imply completion or review',()=>{
  const row={...record(),last_saved:null,last_assessed:'2026-10-17T00:00:00Z',assessment_history:[{status:'addressed',at:'2026-10-17T00:00:00Z'}]};
  expect(safeguardDateFooter(row)).toEqual({text:'Last saved: unavailable'});
  expect(safeguardDateFooter({...row,last_saved:'2026-10-18T09:06:07Z'}).label).toBe('Last saved:');
});

test('never assessed differs from missing or invalid saved metadata',()=>{
  expect(safeguardDateFooter({status:'not_assessed'})).toEqual({text:'Not yet assessed.'});
  expect(safeguardDateFooter({status:'not_assessed',last_saved:'invalid'})).toEqual({text:'Last saved: unavailable'});
  expect(safeguardDateFooter({...record(),last_saved:'2026-02-30T09:00:00Z'})).toEqual({text:'Last saved: unavailable'});
});
