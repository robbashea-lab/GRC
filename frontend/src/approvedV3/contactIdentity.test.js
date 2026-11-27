import scenario from '../../../shared/fixtures/approvedV3Scenario.json';
import {approvedV3IdentityMaps,overlayApprovedClientAssessments} from '../preview/approvedV3Records';
import {applyClientChanges} from './clientCommands';
import {reconcileView} from './nativeWorkspace';

const clone=value=>JSON.parse(JSON.stringify(value));

test('separate blank-email contacts retain native identities across edits and saved refreshes',async()=>{
  const records=clone(scenario.records),identityMaps=approvedV3IdentityMaps(records),clientId='v3sample_ppth';
  const current=clone(scenario.source_state);
  reconcileView(current,overlayApprovedClientAssessments(clone(scenario.source_state),records));
  const api={patch:jest.fn(async(path,body)=>{
    const contact=records.contacts.find(row=>path==='/contacts/'+row.contact_id);
    expect(contact).toBeDefined();expect(contact.client_id).toBe(clientId);
    expect(body.expected_updated_at).toBe(contact.updated_at??null);
    Object.assign(contact,{name:body.name,updated_at:'saved-'+api.patch.mock.calls.length});
    return {data:clone(contact)};
  })};
  const cases=[['6','Updated J.D. Dorian'],['7','Updated Janitor']];
  for(const [sourceRecordId,name] of cases){
    const before=clone(current),after=clone(current);
    const contact=after.records.ppth.contacts.find(row=>row.sourceRecordId===sourceRecordId);
    expect(contact).toBeDefined();expect(contact.email).toBe('');contact.name=name;
    await applyClientChanges({before,after,records,clientId,sourceId:'ppth',identityMaps,api});
    expect(api.patch).toHaveBeenLastCalledWith('/contacts/v3sample_ppth_contacts_'+sourceRecordId,
      expect.objectContaining({name}));
    reconcileView(current,overlayApprovedClientAssessments(clone(current),records));
    expect(current.records.ppth.contacts.find(row=>row.sourceRecordId===sourceRecordId).name).toBe(name);
    expect(new Set(current.records.ppth.contacts.map(row=>row.sourceRecordId)).size).toBe(7);
    expect(current.records.ppth.contacts.find(row=>row.sourceRecordId==='6')).not.toBe(
      current.records.ppth.contacts.find(row=>row.sourceRecordId==='7'));
  }
  expect(api.patch).toHaveBeenCalledTimes(2);
});
