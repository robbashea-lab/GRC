import {DUNDER_EIGHT_YEAR_PLAN as dunder} from './dunderEightYear';
import {PRESTIGE_EIGHT_YEAR_PLAN as prestige} from './prestigeEightYear';

// Content-plan checks only: these do not exercise installation, records or native workflows.
test.each([dunder,prestige])('%s content retains eight elapsed years and dated setbacks/recovery',plan=>{
  const start=new Date(plan.interval.start),anchor=new Date(plan.interval.anchor);
  const anniversary=new Date(start);anniversary.setUTCFullYear(start.getUTCFullYear()+8);
  expect(anniversary.toISOString()).toBe(anchor.toISOString());
  expect(plan.milestones[0].date).toBe(plan.interval.start.slice(0,10));
  const dates=plan.milestones.map(milestone=>milestone.date);
  expect([...dates].sort()).toEqual(dates);
  expect(dates.every(date=>Date.parse(date)>=+start&&Date.parse(date)<=+anchor)).toBe(true);
  expect(new Set(dates.map(date=>date.slice(0,4))).size).toBe(9);
  expect(plan.milestones.every(milestone=>milestone.narrative.length>100&&milestone.outcome.length>20)).toBe(true);
});

test('Dunder content keeps familiar contacts, staffing setback and current-edition boundary',()=>{
  expect(dunder.contacts.map(contact=>contact.name)).toEqual(expect.arrayContaining(['Michael Scott','Dwight Schrute','Jim Halpert','Pam Beesly']));
  const departures=dunder.contacts.filter(contact=>contact.departedOn);
  expect(departures).toHaveLength(3);
  expect(departures.every(contact=>contact.departedOn.startsWith('2021-'))).toBe(true);
  expect(dunder.frameworkBoundary.currentCatalogNotBefore>='2024-02-23').toBe(true);
  const owners=new Set(dunder.contacts.map(contact=>contact.key));
  for(const milestone of dunder.milestones)expect(milestone.owners.every(owner=>owners.has(owner))).toBe(true);
  for(const system of dunder.aiSystems){
    expect(system.introducedOn>=system.availableOn).toBe(true);
    expect(dunder.vendors.some(vendor=>vendor.key===system.vendorKey&&vendor.introducedOn<=system.introducedOn)).toBe(true);
    expect(owners.has(system.owner)).toBe(true);
    expect(system.dataUse.length).toBeGreaterThan(60);
    expect(system.risk.length).toBeGreaterThan(60);
  }
});

test('Prestige content preserves enrolled categories, migration recovery and plausible AI introductions',()=>{
  expect(prestige.categories).toEqual(['security','availability','confidentiality']);
  expect(prestige.frameworkHistory.pointsOfFocusAdopted>='2022-01-01').toBe(true);
  const setback=prestige.milestones.find(item=>item.key==='customer-platform-setback');
  const recovery=prestige.milestones.find(item=>item.key==='validated-platform-recovery');
  expect(setback.date.startsWith('2023-')).toBe(true);
  expect(recovery.date>setback.date).toBe(true);
  const owners=new Set(prestige.business.ownership.map(person=>person.name));
  expect(prestige.milestones.every(milestone=>owners.has(milestone.ownerName))).toBe(true);
  expect(new Set(prestige.aiSystems.map(system=>system.riskKey)).size).toBe(prestige.aiSystems.length);
  for(const system of prestige.aiSystems){
    expect(system.introduced>=system.availableSince).toBe(true);
    expect(owners.has(system.ownerName)).toBe(true);
    expect(system.dataBoundary.length).toBeGreaterThan(60);
    expect(system.riskNarrative.length).toBeGreaterThan(60);
  }
});

test.each([dunder,prestige])('%s vendor and AI plans are bounded content with unique keys',plan=>{
  expect(plan.vendors.length).toBeGreaterThanOrEqual(20);
  expect(plan.vendors.length).toBeLessThanOrEqual(25);
  expect(new Set(plan.vendors.map(vendor=>vendor.key)).size).toBe(plan.vendors.length);
  expect(plan.aiSystems.length).toBeGreaterThanOrEqual(3);
  expect(plan.aiSystems.length).toBeLessThanOrEqual(5);
  expect(new Set(plan.aiSystems.map(system=>system.key)).size).toBe(plan.aiSystems.length);
});
