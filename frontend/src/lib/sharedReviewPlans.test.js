import {sharedFrameworkPlans,reviewConfig,reviewDriver,CATALOGS} from './frameworks';
import {cadenceBasis} from './requirementBasis';

const state={requirements:{'cis-ig1':'applies','iso-27001':'applies','soc-2':'applies'}};
test('30 catalog drivers configure 22 operational activities, with explicit source cadence first',()=>{
  const plans=sharedFrameworkPlans(state);
  expect(plans).toHaveLength(22);expect(plans.flatMap(p=>p.drivers)).toHaveLength(30);
  const access=plans.find(p=>p.baseline_key==='user-access');
  expect(access.drivers).toHaveLength(3);expect(reviewConfig(state,access).recurrence).toBe('quarterly');
  const vulnerability=plans.find(p=>p.baseline_key==='vulnerability');
  expect(reviewConfig(state,vulnerability).recurrence).toBe('monthly');
  const configured={...state,framework_reviews:Object.fromEntries(access.drivers.map(p=>[p.key,{recurrence:'semiannual',due_date:'2027-03-31'}]))};
  expect(reviewConfig(configured,access)).toMatchObject({recurrence:'semiannual',due_date:'2027-03-31',conflict:false});
  configured.framework_reviews[access.drivers[1].key].due_date='2027-04-01';
  expect(reviewConfig(configured,access).conflict).toBe(true);
  const partial={...state,framework_reviews:{[access.drivers[0].key]:{recurrence:'annual'},[access.drivers[1].key]:{}}};
  expect(reviewConfig(partial,access).conflict).toBe(true);
});
test('driver snapshots preserve source and recommendation without treating ISO or SOC as explicit mandates',()=>{
  const access=sharedFrameworkPlans(state).find(p=>p.baseline_key==='user-access');
  const drivers=access.drivers.map(p=>reviewDriver(p.framework_key,p));
  expect(drivers.filter(d=>d.framework_source_minimum)).toHaveLength(1);
  expect(drivers.find(d=>d.framework_key==='cis-ig1').framework_source_minimum).toBe('quarterly');
  expect(drivers.find(d=>d.framework_key==='soc-2').framework_default_cadence).toBe('quarterly');
  expect(CATALOGS['iso-27001'].review_plans.every(p=>!p.source_minimum)).toBe(true);
  expect(cadenceBasis({recurrence:'annual',framework_drivers:drivers},[])).toMatchObject({proposed:'quarterly',belowSource:true});
});
