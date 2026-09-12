import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {useTableControls, TableFilterChips, FilterEmpty} from './TableControls';
let root, container, table;
const columns=[{key:'owner',label:'Owner',filter:true,emptyLabel:'Unassigned'},{key:'status',label:'Status',filter:true}];
const rows=[{owner:'A',status:'open'},{owner:'B',status:'closed'}];
function Harness({scope='account:a',module='test'}) {
  table=useTableControls({columns,rows,module,scope});
  return <><TableFilterChips table={table}/><span data-testid="count">{table.apply(rows).length}</span>{!table.apply(rows).length && <FilterEmpty table={table} name="records"/>}</>;
}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
test('multiple chips can be removed individually and Clear all removes table constraints',async()=>{
  await act(async()=>root.render(<Harness scope="chips:a"/>));
  await act(async()=>table.setFilter('owner',['A']));
  await act(async()=>table.setFilter('status',['closed']));
  expect(container.querySelector('[data-testid="count"]').textContent).toBe('0');
  expect(container.textContent).toContain('No records match');
  await act(async()=>container.querySelector('[aria-label="Remove Status: Closed"]').click());
  expect(table.state.filters).toEqual({owner:['A']});
  await act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Clear all').click());
  expect(table.state.filters).toEqual({});
  expect(table.apply(rows)).toHaveLength(2);
});
test('preferences survive module navigation within a tenant but reset on tenant/account changes',async()=>{
  await act(async()=>root.render(<Harness scope="persist:a" module="reviews"/>));
  await act(async()=>table.setFilter('owner',['A']));
  await act(async()=>table.setSort('owner','desc'));
  await act(async()=>root.render(<Harness scope="persist:a" module="vendors"/>));
  expect(table.state.filters).toEqual({});
  await act(async()=>root.render(<Harness scope="persist:a" module="reviews"/>));
  expect(table.state.filters.owner).toEqual(['A']);
  expect(table.state.sort).toEqual({key:'owner',dir:'desc'});
  await act(async()=>root.render(<Harness scope="persist:b" module="reviews"/>));
  expect(table.state.filters).toEqual({});
  await act(async()=>root.render(<Harness scope="persist:a" module="reviews"/>));
  expect(table.state.filters).toEqual({});
  await act(async()=>table.setFilter('owner',['A']));
  await act(async()=>root.render(<Harness scope="different-account:a" module="reviews"/>));
  expect(table.state.filters).toEqual({});
});
