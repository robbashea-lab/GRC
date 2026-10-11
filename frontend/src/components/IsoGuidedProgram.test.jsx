import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import IsoGuidedProgram from './IsoGuidedProgram';
import {isoRecommendedWork} from '@/lib/isoGuidedProgram';
import {isoProgramMetrics} from '@/lib/isoProgramMetrics';

const assessment=(id,status='not_assessed',extra={})=>({framework_key:'iso-27001',
  framework_assessment_id:'qa-'+id,definition_id:id,title:'Synthetic '+id,
  specification:id.startsWith('A.')?'annex_control':'isms_clause',status,...extra});
let container,root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test('next steps rank unresolved necessity, confirmed gaps, unassessed and partial work without duplicate SoA/Annex gaps',()=>{
  const undecided=assessment('A.5.2','needs_attention'),gap=assessment('7.2','needs_attention'),
    unassessed=assessment('10.2'),partial=assessment('A.6.3','in_progress',{soa_applicability:'included',soa_justification:'Synthetic risk basis'}),
    excluded=assessment('A.5.23','needs_attention',{soa_applicability:'excluded',soa_justification:'Synthetic justified exclusion'});
  const rows=[partial,unassessed,gap,undecided,excluded,undecided],before=JSON.stringify(rows);
  expect(isoRecommendedWork(rows,[],{},'2026-10-11').map(item=>[item.row.definition_id,item.view])).toEqual([
    ['A.5.2','soa'],['7.2','isms_clause'],['10.2','isms_clause'],['A.6.3','annex_control']]);
  expect(JSON.stringify(rows)).toBe(before);
});

test('recommendation buttons retain the exact native identity and destination for each work area',async()=>{
  const rows=[assessment('A.5.2'),assessment('7.2','needs_attention'),
    assessment('A.6.3','in_progress',{soa_applicability:'included',soa_justification:'Synthetic risk basis'})];
  const reviews=[{review_id:'qa-audit',title:'Synthetic audit',due_date:'2999-12-31',iso_audit:{package_key:'governance-risk'}}];
  const onSelect=jest.fn(),onViewAll=jest.fn();
  await act(async()=>root.render(<IsoGuidedProgram rows={rows} reviews={reviews} drafts={{}} onSelect={onSelect} onViewAll={onViewAll}/>));
  const expected=isoRecommendedWork(rows,reviews);
  const buttons=[...container.querySelectorAll('button')];
  expect(buttons.map(button=>button.textContent)).toEqual(['Open A.5.2','Open 7.2','Open A.6.3','Open audit activity','View ISO Overview']);
  for(let index=0;index<expected.length;index++){
    await act(async()=>buttons[index].click());expect(onSelect).toHaveBeenLastCalledWith(expected[index]);
  }
  await act(async()=>buttons.at(-1).click());expect(onViewAll).toHaveBeenCalledTimes(1);
});

test('applicability and implementation figures cannot be changed by verification state',()=>{
  const rows=[assessment('7.2','addressed'),assessment('10.2'),
    assessment('A.5.1','addressed',{soa_applicability:'included'}),
    assessment('A.5.23','addressed',{soa_applicability:'excluded'}),assessment('A.7.2')];
  const metrics=isoProgramMetrics(rows);
  expect(metrics.soa).toEqual({total:3,applicable:1,excluded:1,undetermined:1,decided:2});
  expect(metrics.requirements).toEqual({total:2,implemented:1,partial:0,notImplemented:0,notAssessed:1});
  expect(metrics.annex).toEqual({total:1,implemented:1,partial:0,notImplemented:0,notAssessed:0});
  expect(isoProgramMetrics(rows.map(row=>({...row,verification:'verified'})))).toEqual(metrics);
  expect(isoProgramMetrics(rows.map(row=>({...row,verification:'not_verified'})))).toEqual(metrics);
});

test('unfinished current-quarter and future audit work is not overdue without an actual past deadline',()=>{
  const reviews=[{review_id:'future',due_date:'2026-12-31',iso_audit:{},status:'open'},
    {review_id:'today',due_date:'2026-10-11',iso_audit:{},status:'open'},
    {review_id:'unscheduled',iso_audit:{},status:'open'}];
  const queue=isoRecommendedWork([],reviews,{},'2026-10-11');
  expect(queue.map(item=>[item.review.review_id,item.timing.key])).toEqual([
    ['unscheduled','unscheduled'],['today','upcoming'],['future','upcoming']]);
  expect(queue.some(item=>item.timing.key==='overdue')).toBe(false);
});
