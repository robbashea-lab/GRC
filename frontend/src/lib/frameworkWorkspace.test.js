import {CATALOGS,activeDefinitions} from './frameworks';
import {groupRequirements,nextAssessment,matchesAssessment,sectionSummary,sourcePresentation,recurrencePresentation,assessmentWork} from './frameworkWorkspace';

test('native catalog order and hierarchy survive grouping without losing requirements',()=>{
  const addedHipaaIds=['164.308(b)(2)','164.314(a)(2)(i)','164.314(a)(2)(ii)','164.314(a)(2)(iii)','164.314(b)(2)'];
  for(const [key,catalog] of Object.entries(CATALOGS)){
    const roots=groupRequirements(key,catalog.requirements);
    const ids=catalog.requirements.map(r=>r.id),grouped=roots.flatMap(n=>n.rows.map(r=>r.id));
    expect(grouped).toHaveLength(ids.length);expect(new Set(grouped).size).toBe(ids.length);
    expect([...grouped].sort()).toEqual([...ids].sort());
    // Additive HIPAA children stay appended in the retained catalog and appear in their own existing sections.
    if(key==='hipaa'){
      expect(grouped.filter(id=>!addedHipaaIds.includes(id))).toEqual(ids.filter(id=>!addedHipaaIds.includes(id)));
      expect(ids.filter(id=>addedHipaaIds.includes(id))).toEqual(addedHipaaIds);
    }else expect(grouped).toEqual(ids);
    const positions=new Map(ids.map((id,index)=>[id,index]));
    const checkNodes=nodes=>{
      const firstPositions=nodes.map(node=>positions.get(node.rows[0].id));
      expect(firstPositions).toEqual([...firstPositions].sort((a,b)=>a-b));
      for(const node of nodes){
        const order=node.rows.map(row=>positions.get(row.id));
        expect(order).toEqual([...order].sort((a,b)=>a-b));
        if(node.children.length){
          expect(node.children.flatMap(child=>child.rows.map(row=>row.id)).sort()).toEqual(node.rows.map(row=>row.id).sort());
          checkNodes(node.children);
        }
      }
    };
    checkNodes(roots);
  }
  expect(groupRequirements('cis-ig1',CATALOGS['cis-ig1'].requirements)).toHaveLength(18);
  const nist=groupRequirements('nist-csf-2',CATALOGS['nist-csf-2'].requirements);
  expect(nist).toHaveLength(6);expect(nist.every(n=>n.children.length>0)).toBe(true);
  expect(groupRequirements('iso-27001',CATALOGS['iso-27001'].requirements).map(n=>n.id)).toEqual(['isms_clause','annex_control']);
  const levelOne=activeDefinitions('cmmc',{level:1}),levelTwo=activeDefinitions('cmmc',{level:2});
  expect(levelOne.map(row=>row.id)).toEqual(['3.1.1','3.1.2','3.1.20','3.1.22','3.5.1','3.5.2','3.8.3',
    '3.10.1','3.10.3','3.10.4','3.10.5','3.13.1','3.13.5','3.14.1','3.14.2','3.14.4','3.14.5']);
  expect(new Set(levelOne.map(row=>row.level_one_parent))).toEqual(new Set(['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii','xiii','xiv','xv']));
  expect(levelOne.filter(row=>row.level_one_parent==='ix').map(row=>row.id)).toEqual(['3.10.3','3.10.4','3.10.5']);
  expect(groupRequirements('cmmc',levelOne).flatMap(node=>node.rows.map(row=>row.id))).toEqual(levelOne.map(row=>row.id));
  expect(levelTwo).toHaveLength(110);expect(new Set(levelTwo.map(row=>row.id)).size).toBe(110);
});
test('resume and filters keep assessment status independent from overdue operations',()=>{
  const rows=[{framework_assessment_id:'a',status:'addressed',work:{overdue_reviews:1}},{framework_assessment_id:'b',status:'not_assessed'},{framework_assessment_id:'c',status:'in_progress'}];
  expect(nextAssessment(rows,'c')).toBe(rows[2]);expect(nextAssessment(rows,'a')).toBe(rows[1]);
  expect(nextAssessment([rows[0]])).toBe(rows[0]);expect(nextAssessment([{status:'addressed'}])).toBeNull();
  expect(matchesAssessment(rows[0],'attention')).toBe(true);expect(rows[0].status).toBe('addressed');
  expect(sectionSummary(rows)).toMatchObject({total:3,assessed:2,attention:3});
});
test('official text requires explicit trusted content and unsafe links are not rendered',()=>{
  expect(sourcePresentation({guidance:'Paraphrase',source:'https://example.test'})).toMatchObject({mode:'REFERENCE_ONLY',text:null});
  expect(sourcePresentation({official_text_mode:'LICENSED_TEXT',official_text:'Authorized text',source:'javascript:alert(1)'})).toMatchObject({mode:'LICENSED_TEXT',text:'Authorized text',url:null});
  expect(sourcePresentation({official_text_mode:'OFFICIAL_TEXT'}).mode).toBe('REFERENCE_ONLY');
});
test('a grouped plan interval is attributed only to its cited requirement',()=>{
  const catalog={review_plans:[{safeguards:['a','b'],cadence_references:[{definition_id:'a',interval:'annual'}]}]};
  expect(recurrencePresentation({id:'a'},catalog).basis).toBe('REQUIRED_EXPLICIT');
  expect(recurrencePresentation({id:'b'},catalog).basis).toBe('RECOMMENDED');
  expect(recurrencePresentation({id:'c'},catalog).basis).toBe('NONE');
  expect(recurrencePresentation({id:'c',type:'recurring',source_type:'standard_reference'},catalog).basis).toBe('REQUIRED_ORG_DEFINED');
});
test('operational projection follows relationships without leaking other clients',()=>{
  const row={client_id:'a',framework_assessment_id:'assessment',related_links:[{kind:'reviews',id:'r'}]};
  const work=assessmentWork(row,{reviews:[{client_id:'a',review_id:'r',status:'upcoming',due_date:'2026-01-01'},{client_id:'b',review_id:'r',status:'upcoming',due_date:'2026-01-01'}],findings:[{client_id:'a',finding_id:'f',review_id:'r',status:'open'}],tasks:[{client_id:'a',task_id:'t',finding_id:'f',due_date:'2026-01-01',status:'open'}],evidence:[{client_id:'a',evidence_id:'e',linked_type:'framework_assessment',linked_id:'assessment',created_at:'2025-12-01T00:00:00Z'},{client_id:'b',evidence_id:'x',linked_type:'framework_assessment',linked_id:'assessment',created_at:'2026-01-01'}]},'2026-01-02');
  expect(work).toEqual({review_ids:['r'],finding_ids:['f'],open_findings:1,direct_findings:0,overdue_reviews:1,next_review_due:null,overdue_actions:1,open_actions:1,evidence_count:1,latest_evidence_at:'2025-12-01'});
});
test('unlinked or deleted Evidence no longer counts as current support for a safeguard',()=>{
  const row={client_id:'a',framework_assessment_id:'assessment',related_links:[],unlinked_evidence_ids:['wrong']};
  const upload=(id,at,extra={})=>({client_id:'a',evidence_id:id,linked_type:'framework_assessment',linked_id:'assessment',created_at:at,...extra});
  const work=assessmentWork(row,{evidence:[upload('kept','2025-06-01T00:00:00Z'),upload('wrong','2026-01-01T00:00:00Z'),upload('deleted','2026-02-01T00:00:00Z',{archived_at:'2026-02-02T00:00:00Z'})]},'2026-03-01');
  expect(work.evidence_count).toBe(1);
  expect(work.latest_evidence_at).toBe('2025-06-01');
});
