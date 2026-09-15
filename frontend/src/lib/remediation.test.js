import {historicalRemediation} from './remediation';

test('only completed actions and closed findings leave active Review relationships',()=>{
  expect(historicalRemediation('tasks',{status:'done'})).toBe(true);
  expect(historicalRemediation('findings',{status:'closed'})).toBe(true);
  for(const status of ['open','in_remediation','remediated','accepted']) expect(historicalRemediation('findings',{status})).toBe(false);
  expect(historicalRemediation('tasks',{status:'in_progress'})).toBe(false);
  expect(historicalRemediation('risks',{status:'closed'})).toBe(false);
});
