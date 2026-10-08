import {vendorMatches,assuranceAttention,assuranceState,vendorColumns,renewalAction} from './brawndoVendors';
import {tableColumns} from './tableColumns';
import {applyTableFilters} from './tableFilters';
const now=new Date('2026-09-30T12:00:00Z');
const vendor={status:'active',criticality:'critical',next_review:'2026-09-30',assurance_records:[]};
test('30-day summaries distinguish today, overdue, lifecycle and one vendor with many documents',()=>{
  expect(vendorMatches(vendor,'review_due',now)).toBe(true);
  expect(vendorMatches(vendor,'review_overdue',now)).toBe(false);
  expect(vendorMatches({...vendor,next_review:'2026-09-29'},'review_overdue',now)).toBe(true);
  expect(vendorMatches({...vendor,next_review:'2026-10-31'},'review_due',now)).toBe(false);
  expect(vendorMatches({...vendor,next_review:''},'review_overdue',now)).toBe(false);
  for(const status of ['onboarding','active','offboarding'])expect(vendorMatches({...vendor,status},'all_active',now)).toBe(true);
  expect(vendorMatches({...vendor,status:'inactive'},'critical',now)).toBe(false);
  expect(vendorMatches({...vendor,status:'under_review'},'all_active',now)).toBe(false);
  expect(vendorMatches(vendor,'unassigned',now)).toBe(true);
  const rows=[{...vendor,assurance_records:[{next_follow_up:'2026-09-20'},{next_follow_up:'2026-10-20'}]}];
  expect(rows.filter(v=>vendorMatches(v,'assurance',now))).toHaveLength(1);
});
test('renewal notice wins; contract end, coverage, expiration and follow-up are independent',()=>{
  const v={...vendor,contract_renewal:'2027-01-01',contract_expiration:'2026-10-05',contract_notice_deadline:'2026-10-10'};
  expect(vendorMatches(v,'renewal_soon',now)).toBe(true);expect(vendorMatches(v,'contract_soon',now)).toBe(true);
  expect(renewalAction(v).label).toBe('Notice deadline');
  expect(assuranceAttention({type:'SOC 2',coverage_end:'2025-01-01'},now)).toEqual([]);
  expect(assuranceAttention({type:'ISO 27001',certificate_expires_at:'2026-09-01'},now)).toEqual(['Certificate expired']);
  expect(assuranceAttention({next_follow_up:'2026-09-30'},now)).toEqual(['Follow-up due within 30 days']);
  expect(assuranceAttention({next_follow_up:'2026-09-01',superseded_by:'new'},now)).toEqual([]);
  expect(assuranceState({type:'SOC 2',evidence_ids:['e']})).toBe('Not recorded');
  expect(assuranceState({review_status:'awaiting_update',expected_availability:'2020-01-01'})).toBe('Awaiting Update');
});
test('date sort keeps missing values last in both directions and categories have no sorting',()=>{
  const columns=vendorColumns(tableColumns('vendor-register',{rows:[],users:[]}));
  const rows=[{name:'missing'},{name:'early',next_review:'2026-01-01'},{name:'late',next_review:'2027-01-01'}];
  for(const dir of ['asc','desc'])expect(applyTableFilters(rows,columns,{filters:{},sort:{key:'next_review',dir}}).at(-1).name).toBe('missing');
  expect(columns.find(c=>c.key==='criticality').sortable).toBe(false);
  expect(columns.find(c=>c.key==='contract_renewal').value({contract_expiration:'2026-01-01'})).toBeUndefined();
});
test('renewals include today through day 30, retain literal calendar dates, and exclude closed relationships',()=>{
  for(const [date,expected] of [['2026-09-29',false],['2026-09-30',true],['2026-10-30',true],['2026-10-31',false],['2026-10-30T23:00:00-05:00',true]]) {
    expect(vendorMatches({...vendor,contract_renewal:date},'renewal_soon',now)).toBe(expected);
  }
  for(const status of ['inactive','terminated']) {
    expect(vendorMatches({...vendor,status,contract_renewal:'2026-10-15'},'renewal_soon',now)).toBe(false);
  }
});
test('renewals preserve notice precedence without substituting expiration for missing or invalid dates',()=>{
  const base={...vendor,contract_expiration:'2026-10-15',contract_end:'2026-10-15'};
  for(const contract_renewal of [undefined,null,'','not-a-date','2026-02-30']) {
    expect(vendorMatches({...base,contract_renewal},'renewal_soon',now)).toBe(false);
  }
  expect(vendorMatches({...base,contract_renewal:'2027-01-01',contract_notice_deadline:'2026-10-15'},'renewal_soon',now)).toBe(true);
  for(const contract_notice_deadline of ['2027-01-01','not-a-date','2026-02-30']) {
    expect(vendorMatches({...base,contract_renewal:'2026-10-15',contract_notice_deadline},'renewal_soon',now)).toBe(false);
  }
  expect(vendorMatches({...base,contract_renewal:'2026-10-15',contract_notice_deadline:''},'renewal_soon',now)).toBe(true);
});
test('Dashboard assurance attention preserves required evidence, refresh windows, and lifecycle exclusions',()=>{
  const report={type:'SOC 2',required:true,evidence_ids:['report'],received_at:'2026-09-01',refresh_due:'2027-01-01'};
  const required={...vendor,assurance_required:true,assurance_records:[report]};
  expect(vendorMatches(required,'assurance_attention',now)).toBe(false);
  for(const change of [{evidence_ids:[]},{received_at:''},{refresh_due:''},{refresh_due:'2026-02-30'},{refresh_due:'2026-09-29'},{refresh_due:'2026-09-30'},{refresh_due:'2026-12-29'}]) {
    expect(vendorMatches({...required,assurance_records:[{...report,...change}]},'assurance_attention',now)).toBe(true);
  }
  expect(vendorMatches({...required,assurance_records:[{...report,refresh_due:'2026-12-30'}]},'assurance_attention',now)).toBe(false);
  expect(vendorMatches({...required,assurance_window_days:14,assurance_records:[{...report,refresh_due:'2026-10-14'}]},'assurance_attention',now)).toBe(true);
  expect(vendorMatches({...required,assurance_window_days:14,assurance_records:[{...report,refresh_due:'2026-10-15'}]},'assurance_attention',now)).toBe(false);
  const missing={...required,assurance_records:[{type:'SOC 2',required:true}]};
  for(const status of ['inactive','terminated','offboarding']) {
    expect(vendorMatches({...missing,status},'assurance_attention',now)).toBe(false);
  }
  expect(vendorMatches({...missing,archived_at:'2026-09-01'},'assurance_attention',now)).toBe(false);
  expect(vendorMatches({...missing,assurance_required:false},'assurance_attention',now)).toBe(false);
  expect(vendorMatches({...missing,assurance_records:[{type:'SOC 2',required:false}]},'assurance_attention',now)).toBe(false);
});
test('document follow-ups stay distinct from required assurance attention and exclude superseded documents',()=>{
  const followUp={...vendor,assurance_required:false,assurance_records:[{type:'SOC 2',next_follow_up:'2026-10-15'}]};
  expect(vendorMatches(followUp,'assurance',now)).toBe(true);
  expect(vendorMatches(followUp,'assurance_attention',now)).toBe(false);
  const attention={...vendor,assurance_required:true,assurance_records:[{type:'SOC 2',required:true,evidence_ids:['report'],received_at:'2026-09-01',refresh_due:'2026-11-15'}]};
  expect(vendorMatches(attention,'assurance',now)).toBe(false);
  expect(vendorMatches(attention,'assurance_attention',now)).toBe(true);
  expect(vendorMatches({...vendor,assurance_records:[{next_follow_up:'2026-09-01',superseded_by:'new'},{next_follow_up:'2027-01-01'}]},'assurance',now)).toBe(false);
});
