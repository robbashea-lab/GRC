import catalog from '@catalogs/soc2.json';
import {cisSummary} from './cisVerification';
import {groupRequirements,matchesAssessment,workspaceScope} from './frameworkWorkspace';

const rows=catalog.requirements.map(d=>({...d,definition_id:d.id,status:'not_assessed'}));

test('SOC uses all 61 actual criteria and preserves native category/group hierarchy',()=>{
  expect(rows).toHaveLength(61);
  expect(new Set(rows.map(r=>r.definition_id)).size).toBe(61);
  const groups=groupRequirements('soc-2',rows);
  expect(groups.map(g=>g.id)).toEqual(['security','availability','confidentiality','processing_integrity','privacy']);
  expect(groups.flatMap(g=>g.children.flatMap(c=>c.rows))).toHaveLength(61);
  for(const group of groups)for(const child of group.children){
    expect(child.rows.every(r=>r.category===group.id&&r.control===child.id)).toBe(true);
  }
});

test('SOC dashboard denominator excludes retained criteria using the workspace scope',()=>{
  const security=rows.filter(r=>r.category==='security');
  const data={active_definition_ids:security.map(r=>r.definition_id)};
  const active=rows.filter(r=>workspaceScope('soc-2',data,r));
  expect(active).toEqual(security);
  expect(active).toHaveLength(33);
  expect(cisSummary(active).total).toBe(33);
  expect(cisSummary(rows).total).toBe(61);
});

test('SOC status and gap counts link to the same filtered population without treating inherited Review Findings as remediation',()=>{
  const sample=rows.slice(0,5).map((r,i)=>({...r,status:['addressed','in_progress','needs_attention','not_assessed','not_applicable'][i],work:{evidence_count:i===0?1:0,direct_findings:0,open_findings:i===1?1:0}}));
  const summary=cisSummary(sample);
  expect(summary.applicable).toBe(4);
  expect(summary.implemented).toBe(25);
  expect(summary.coverage).toBe(75);
  expect(summary.na).toBe(1);
  expect(summary.unremediated).toBe(2);
  for(const [filter,count] of [['addressed',summary.addressed],['in_progress',summary.partial],['needs_attention',summary.gap],['not_assessed',summary.notAssessed],['not_applicable',summary.na],['unremediated',summary.unremediated],['unevidenced',summary.unevidenced]]){
    expect(sample.filter(r=>matchesAssessment(r,filter))).toHaveLength(count);
  }
});
