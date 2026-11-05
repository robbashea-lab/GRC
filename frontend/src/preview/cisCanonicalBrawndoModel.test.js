import {brawndoArtifactModel} from './cisCanonicalBrawndoModel';
import {brawndoArtifactSpecs} from './cisCanonicalBrawndoBooks';

test('shared CIS remediation stays one Finding Action with distinct Risk treatment and closure decisions',()=>{
  const {db,operations,history}=brawndoArtifactModel('2026-11-02T00:00:00.000Z');
  for(const [key,id] of [['asset-owners','1.1'],['configuration','4.1'],['vulnerability-process','7.1']]){
    const risk=operations.risks.find(row=>row.risk_id==='demo_brawndo_canonical_risk_'+key);
    const finding=history.findings.find(row=>row.definition_id===id);
    const task=db.tasks.find(row=>row.task_id===finding.primary_task_id);
    expect(task.source_type).toBe('finding');expect(task.source_id).toBe(finding.finding_id);
    expect(risk.related_task_ids).toContain(task.task_id);
    expect(risk.related_finding_ids).toContain(finding.finding_id);
    expect(db.tasks.some(row=>row.task_id==='demo_brawndo_canonical_task_'+key)).toBe(false);
    expect(operations.tasks.some(row=>row.task_id==='demo_brawndo_canonical_task_'+key)).toBe(false);
    expect(risk.status).toBe('in_progress');expect(risk.closed_at).toBeUndefined();
  }
});

test('actual operating samples cover assessed safeguards without manufacturing unknown observations',()=>{
  const books=brawndoArtifactSpecs('2026-11-02T00:00:00.000Z');
  const samples=books.filter(row=>row.key.startsWith('operating-'));
  expect(samples).toHaveLength(7);expect(books.length).toBeLessThanOrEqual(32);
  expect(samples.every(row=>Buffer.byteLength(row.text,'utf8')<=16384)).toBe(true);
  const covered=new Set(samples.flatMap(row=>row.relationships.filter(link=>link.kind==='framework_assessments').map(link=>link.id)));
  expect(covered.size).toBe(54);
  for(const id of ['11.4','14.8'])expect(covered.has('fw_demo_brawndo_assessment_'+id)).toBe(false);
  const inventory=samples.find(row=>row.key==='operating-inventory');
  expect(inventory.text).toContain('BW-KIOSK-06');expect(inventory.text).toContain('MAC and custodian missing');
  expect(inventory.text).toContain('BitLocker:on');
});
