import {activeDefinitions} from '../lib/frameworks';
import {reviewSchedule} from '../lib/reviewOccurrences';
import {ids} from './store';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {establishKrustyBaseline} from './cisCanonicalKrustyBaseline';
import {populateKrustyAssessments} from './cisCanonicalKrustyAssessments';
import {populateKrustyGovernance} from './cisCanonicalKrustyGovernance';
import {KRUSTY_SCENARIO_PROFILE, krustySafeguardContent} from './cisCanonicalKrustyContent';
import {krustyOperatingSamples} from './cisCanonicalKrustySamples';

const CLOCK = new Date('2026-11-04T12:00:00.000Z'), dates = cisDemoFixtureDates(CLOCK);
const CID = 'demo_krusty_krab', rowsOf = artifacts => artifacts.flatMap(artifact => artifact.rows);
const forId = (rows, id) => rows.filter(row => row.safeguards.split('|').includes(id));
const values = (rows, id) => forId(rows,id).map(row => row.observed_value).join('\n');
const idsOf = rows => [...new Set(rows.flatMap(row => row.safeguards.split('|')))].sort();
const latest = rows => rows.map(row => row.observed_at).sort().at(-1);
const contacts = ['Eugene Krabs','Squidward Tentacles','SpongeBob SquarePants'];

test('nine logical groups cover exactly153 native cumulative IG3 safeguards without unsupported identities or assessment plans', () => {
  const artifacts = krustyOperatingSamples(dates), rows = rowsOf(artifacts);
  const definitions = activeDefinitions('cis-ig1',{implementation_group:3});
  expect(artifacts).toHaveLength(9); expect(new Set(artifacts.map(row => row.key)).size).toBe(9);
  expect(definitions).toHaveLength(153);
  expect(idsOf(rows)).toEqual(definitions.map(row => row.id).sort());
  for (const artifact of artifacts) {
    expect(artifact.rows.length).toBeGreaterThan(0);
    expect(artifact.title).toMatch(/^DEMO - SYNTHETIC:/);
    expect(artifact.assessment_ids).toEqual([...new Set(artifact.rows.flatMap(row => row.safeguards.split('|')))]
      .map(id => 'fw_'+CID+'_assessment_'+id));
    expect(artifact.assessment_ids.every(id => id.startsWith('fw_'+CID+'_assessment_'))).toBe(true);
  }
  expect(rows.some(row => row.activity === 'assessment plan only')).toBe(false);
});

test('source rows retain concrete observations, existing fictional accountability and bounded native-compatible strings', () => {
  const fields = ['observed_at','safeguards','scope','entity','source_file','observed_value','result','exceptions',
    'owner_role','activity','cadence_or_trigger','source_classification','basis'];
  for (const row of rowsOf(krustyOperatingSamples(dates))) {
    expect(Object.keys(row).sort()).toEqual(fields.slice().sort());
    expect(Object.values(row).every(value => typeof value === 'string')).toBe(true);
    expect(row.scope).toMatch(/^Fictional Krusty/);
    expect(row.entity.trim()).not.toBe(''); expect(row.source_file).toMatch(/\.csv$/);
    expect(row.observed_value.length).toBeGreaterThan(100);
    expect(row.observed_value).not.toMatch(/^(implemented|addressed|passed|complete|verified)$/i);
    expect(contacts.some(name => row.owner_role.startsWith(name+' — '))).toBe(true);
    expect(row.source_classification).toBe(row.activity === 'documented process excerpt'
      ? 'fictional_process_excerpt' : 'fictional_operating_sample');
    expect(row.basis).toMatch(/not independent verification, a native save, a signature or an uploaded-file claim/);
    expect(row.basis).toMatch(/Nonexhaustive excerpts do not prove every past period/);
    for (const id of row.safeguards.split('|')) {
      const definition = activeDefinitions('cis-ig1',{implementation_group:3}).find(item => item.id === id);
      expect(row.observed_value).not.toBe(definition.title);
      expect(row.observed_value).not.toBe(krustySafeguardContent(id,'addressed').current_implementation);
    }
  }
});

test('current population excerpts reconcile people,assets,administrative subsets and service identities', () => {
  const rows = rowsOf(krustyOperatingSamples(dates));
  expect(KRUSTY_SCENARIO_PROFILE.asset_scope).toMatchObject({franchise_sites:12,workforce_members:216,
    managed_laptops:36,managed_phones:24,pos_terminals:72,ordering_kiosks:24,kitchen_controllers:24,network_devices:60,cloud_workloads:24});
  expect(values(rows,'1.1')).toMatch(/laptops36,phones24,POS72,kiosks24,managed kitchen consoles24,network60,cloud24=264/);
  expect(values(rows,'1.1')).toMatch(/six admin laptops are within36,not additional assets/);
  expect(values(rows,'1.1')).toMatch(/POS072 remains one of the72 counted POS assets/);
  expect(values(rows,'5.1')).toMatch(/240=216 workforce\+6 dedicated administrator identities\+18 services/);
  expect(values(rows,'5.5')).toMatch(/Service register18\/18.*owner,purpose and review date/);
  expect(values(rows,'12.8')).toMatch(/six designated machines within36 laptops.*Internet access DENY6\/6/);
});

test('actual automation,weekly work and source-specific triggers are not replaced by annual tickets', () => {
  const rows = rowsOf(krustyOperatingSamples(dates));
  expect(forId(rows,'1.1').every(row => row.observed_at === dates.month(-1))).toBe(true);
  expect(forId(rows,'1.3').map(row => row.observed_at)).toEqual([-5,-4,-3].map(offset => dates.day(offset)));
  expect(forId(rows,'1.3').every(row => row.activity === 'automated operating job' && row.cadence_or_trigger === 'daily')).toBe(true);
  expect(forId(rows,'8.11').map(row => row.observed_at)).toEqual([-25,-18,-11,-4].map(offset => dates.day(offset)));
  expect(forId(rows,'8.11').every(row => row.result.startsWith('performed fictional log examination'))).toBe(true);
  expect(values(rows,'7.5')).toMatch(/authenticated eligible OS targets180\/180.*Unauthenticated scan perspective/);
  expect(forId(rows,'7.5')[0].cadence_or_trigger).toMatch(/at least quarterly.*authenticated and unauthenticated/);
  expect(forId(rows,'2.7')[0].cadence_or_trigger).toMatch(/at least every six months.*continuous execution/);
  expect(forId(rows,'11.5')[0]).toMatchObject({activity:'manual operating activity',cadence_or_trigger:'sampled recovery tests at least quarterly'});
  expect(values(rows,'11.5')).toMatch(/restore4\/4 usable.*Backup counters and future appointments were not substituted/);
  expect(forId(rows,'16.6')[0].cadence_or_trigger).toBe('severity system/process maintained at least annually');
  expect(forId(rows,'17.8')[0].cadence_or_trigger).toMatch(/after an incident;no invented annual/);
});

test('manual predecessor dates reconcile to the actual19 native Governance schedules without inventing completed occurrences', () => {
  jest.useFakeTimers().setSystemTime(CLOCK);
  try {
    const actor = {user_id:'demo_admin',name:'Synthetic coordinator',workspace_mode:'demo',role:'super_admin',status:'active',client_ids:[CID]};
    const db = {...Object.fromEntries(Object.keys(ids).map(kind => [kind,[]])),user:actor,users:[actor],logs:[],baselines:{},drafts:{},
      clients:[{client_id:CID,name:'The Krusty Krab',environment:'Demo',status:'active',assigned_owner_id:actor.user_id}],
      contacts:contacts.map((name,index) => ({contact_id:CID+'_contact_'+index,client_id:CID,name,status:'active'}))};
    establishKrustyBaseline(db,{dates});
    populateKrustyAssessments(db,{dates,owner:actor.user_id});
    const governance = populateKrustyGovernance(db,{dates,owner:actor.user_id});
    const rows = rowsOf(krustyOperatingSamples(dates));
    expect(governance.reviews).toHaveLength(19);
    for (const [id,plan] of [
      ['1.5','passive-discovery-reconciliation'],['2.7','script-allowlist-reassessment'],
      ['5.1','account-authorization'],['13.11','event-alert-tuning'],['14.1','awareness'],
      ['15.1','provider-inventory'],['17.7','incident-governance'],['18.2','penetration-testing'],
      ['18.5','internal-penetration-test'],['16.4','secure-development'],['12.1','software-support'],
    ]) {
      const review = governance.reviews.find(row => row.framework_plan_key === plan);
      const day = latest(forId(rows,id).filter(row => row.activity !== 'documented process excerpt'));
      expect(reviewSchedule({...review,due_date:day,recurrence_due_date:null}).next_review_date.slice(0,10)).toBe(review.due_date);
    }
    for (const id of ['8.11','11.5']) {
      const review = governance.reviews.find(row => !row.framework_plan_key && row.framework_safeguards.includes(id));
      expect(reviewSchedule({...review,due_date:latest(forId(rows,id)),recurrence_due_date:null}).next_review_date.slice(0,10)).toBe(review.due_date);
    }
    const inventory = governance.reviews.find(row => row.framework_plan_key === 'asset-inventory');
    expect(reviewSchedule({due_date:dates.month(-1),recurrence:'semiannual'},true).next_review_date.slice(0,10)).toBe(inventory.due_date);
    expect(governance.reviews.every(review => review.occurrences.length === 0)).toBe(true);
  } finally {jest.useRealTimers();}
});

test('source scope retains supported-platform limits,work/personal separation and sensitive information', () => {
  const rows = rowsOf(krustyOperatingSamples(dates));
  expect(values(rows,'3.1')).toMatch(/guest-order contacts.*personnel.*recipes.*retention/);
  expect(values(rows,'3.9')).toMatch(/encrypted.*cannot read contents without controlled unlock/);
  expect(values(rows,'4.11')).toMatch(/offline state pending.*confirmation15:15.*not called erased/);
  expect(values(rows,'4.12')).toMatch(/assigned24\/24.*Personal app -> work document DENY.*work-to-personal share DENY/);
  expect(values(rows,'6.2')).toMatch(/termination16:00.*disable16:00.*revoked16:00.*no waiting for a dormant/);
  expect(values(rows,'6.8')).toMatch(/Role matrix and actual entitlements reconciled/);
  expect(values(rows,'13.7')).toMatch(/support limits.*no imaginary host agent or blanket N\/A/);
  expect(values(rows,'8.12')).toMatch(/unavailable event types.*No claim is made that every supplier exposes every event/);
  expect(values(rows,'8.10')).toMatch(/selected retention180days/);
  expect(forId(rows,'8.10')[0].exceptions).toMatch(/not a five-year raw-log promise/);
});

test('provider observations retain annual,new and renewed terms,ongoing monitoring and actual inactive exit', () => {
  const rows = rowsOf(krustyOperatingSamples(dates)), assessments = forId(rows,'15.5');
  expect(assessments).toHaveLength(3);
  expect(assessments.map(row => row.observed_at)).toEqual([dates.day(45-365),dates.day(-367),dates.day(-367)]);
  expect(assessments[1].cadence_or_trigger).toMatch(/^new contract/);
  expect(assessments[2].cadence_or_trigger).toMatch(/^renewed contract/);
  expect(assessments[1].observed_at < dates.month(-12)).toBe(true);
  expect(assessments[2].observed_at < dates.month(-12)).toBe(true);
  expect(values(rows,'15.4')).toMatch(/no missing applicable term.*No signature or external certification/);
  expect(forId(rows,'15.6')[0].cadence_or_trigger).toMatch(/receipt\/change-triggered.*provider policy/);
  expect(forId(rows,'15.1')[0].observed_at < forId(rows,'15.7')[0].observed_at).toBe(true);
  expect(values(rows,'15.1')).toMatch(/then-active15.*Old Galley is still active.*later exit is recorded separately/);
  expect(values(rows,'15.1')).not.toMatch(/active14\+inactive1/);
  expect(forId(rows,'15.7')[0].observed_at).toBe(dates.month(-8));
  expect(values(rows,'15.7')).toMatch(/inactive with history.*not a fabricated recurring annual/);
});

test('application excerpts separate performed operations,source frequencies and pre-code design', () => {
  const rows = rowsOf(krustyOperatingSamples(dates));
  expect(values(rows,'16.2')).toMatch(/timing metrics.*Outside-stakeholder reporting/);
  expect(values(rows,'16.3')).toMatch(/ownership check is corrected.*cross-franchise request DENY.*regression coverage/);
  expect(values(rows,'16.4')).toMatch(/Planned CT12.*risk before adoption/);
  expect(values(rows,'16.4')).toMatch(/Monthly composition comparison checks updates,removals and support/);
  expect(forId(rows,'16.4')[0].cadence_or_trigger).toMatch(/at least monthly/);
  expect(values(rows,'16.12')).toMatch(/static analysis and a dynamic test deployment.*Eight targeted.*CIS every-commit mandate/);
  expect(values(rows,'16.13')).toMatch(/manually exercises authenticated and unauthenticated.*DENY/);
  expect(forId(rows,'16.13')[0].cadence_or_trigger).toMatch(/no independent numeric16.13 interval/);
  expect(values(rows,'16.14')).toMatch(/Trained reviewers.*before coding/);
  expect(forId(rows,'16.14')[0].observed_at < forId(rows,'16.13')[0].observed_at).toBe(true);
});

test('each performed penetration test retains its own subsequent defense validation without fabricating workflow closure', () => {
  const rows = rowsOf(krustyOperatingSamples(dates)), validations = forId(rows,'18.4');
  expect(validations).toHaveLength(3);
  for (const [id,entity] of [['18.2','EXT01'],['18.5','INT01'],['16.13','Application-test']]) {
    const performed = forId(rows,id)[0];
    const validation = validations.find(row => row.entity.startsWith(entity));
    expect(validation.observed_at > performed.observed_at).toBe(true);
    expect(validation.observed_at <= dates.day(-2)).toBe(true);
    expect(validation.cadence_or_trigger).toMatch(/after each penetration test/);
  }
  expect(values(rows,'18.3')).toMatch(/does not itself mark a native Finding validated or a Risk accepted\/closed/);
  expect(values(rows,'17.8')).toMatch(/removed the grant.*confirmed denied access.*no current missing access control/);
  expect(values(rows,'17.9')).toMatch(/existing Incident document/);
});

test('document excerpts and current samples confer no signatures,uploaded-byte availability or full-history coverage', () => {
  const rows = rowsOf(krustyOperatingSamples(dates)), excerpts = rows.filter(row => row.activity === 'documented process excerpt');
  expect(excerpts.length).toBeGreaterThan(8);
  expect(excerpts.every(row => row.observed_at === dates.day(-3))).toBe(true);
  expect(excerpts.every(row => row.source_classification === 'fictional_process_excerpt')).toBe(true);
  for (const row of rows) {
    for (const field of ['evidence_id','sha256','approval_subject','approved_at','verified_at','completed_at','client_id'])
      expect(row).not.toHaveProperty(field);
    expect(row.basis).toMatch(/not independent verification.*uploaded-file claim/);
  }
});

test('generation is deterministic,returns fresh data and uses only the retained date anchor', () => {
  const first = krustyOperatingSamples(dates), original = JSON.stringify(first);
  first[0].rows[0].observed_value = 'Caller-local edit'; first[0].assessment_ids.push('Caller-local ID');
  expect(JSON.stringify(krustyOperatingSamples(dates))).toBe(original);
  for (const row of rowsOf(krustyOperatingSamples(dates))) {
    expect(row.observed_at >= '2024-07-01' && row.observed_at <= dates.day(-2)).toBe(true);
    expect(row.observed_value).not.toMatch(/password\s*[:=]\s*\S+|Bearer\s+[A-Za-z0-9._-]+|-----BEGIN .*PRIVATE KEY/);
  }
  expect(original).not.toMatch(/demo_initech|demo_brawndo|customer@example\.com/);
  const later = cisDemoFixtureDates(new Date('2027-01-31T19:00:00.000Z'));
  expect(forId(rowsOf(krustyOperatingSamples(later)),'1.1').every(row => row.observed_at === later.month(-1))).toBe(true);
  expect(() => krustyOperatingSamples({anchor:'2026-02-30T00:00:00.000Z',day:()=>'',month:()=>''})).toThrow('frozen UTC');
  expect(() => krustyOperatingSamples({...dates,day:() => dates.day(0)})).toThrow('assessment cutoff');
  expect(() => krustyOperatingSamples(cisDemoFixtureDates(new Date('2024-08-04T12:00:00.000Z')))).toThrow('parent cadence');
});
