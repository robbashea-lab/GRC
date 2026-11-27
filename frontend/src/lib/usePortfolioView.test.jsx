import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {usePortfolioView} from './usePortfolioView';
let root,container,current;
function Harness({user}){current=usePortfolioView(user);return <div>{current[0].search}</div>;}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('navigation and refreshed authentication retain actor preferences; a different actor starts clean',()=>{
  const user={user_id:'a',role:'super_admin',client_ids:[]};
  act(()=>root.render(<Harness user={user}/>));
  act(()=>current[1]({search:'Cyber',mine:true,includeArchived:true,table:{filters:{frameworks:['cmmc']},sort:{key:'name',dir:'desc'}},scroll:320}));
  act(()=>root.render(null));act(()=>root.render(<Harness user={user}/>));
  expect(current[0]).toMatchObject({search:'Cyber',mine:true,includeArchived:true,scroll:320,table:{sort:{key:'name',dir:'desc'}}});
  act(()=>root.render(<Harness user={{...user}}/>));
  expect(current[0]).toMatchObject({search:'Cyber',mine:true});
  act(()=>root.render(<Harness user={{...user,user_id:'different'}}/>));
  expect(current[0]).toMatchObject({search:'',mine:false,table:{filters:{}}});
});

test('refresh restores only validated preferences and isolates changed role/mode/scope',()=>{
  const user={user_id:'refresh-user',role:'super_admin',client_ids:[]};
  act(()=>root.render(<Harness user={user}/>));
  act(()=>current[1]({search:'  ISO  ',mine:true,framework:'iso-27001',sort:'activity',chartView:'mix'}));
  act(()=>root.render(<Harness user={{...user}}/>));
  expect(current[0]).toMatchObject({search:'  ISO  ',mine:true,framework:'iso-27001',sort:'activity-desc',chartView:'mix'});
  act(()=>root.render(<Harness user={{...user,role:'platform_admin',client_ids:['only-one']}}/>));
  expect(current[0]).toMatchObject({search:'',mine:false,framework:'all',sort:'name'});
});
test.each(['attention','name','next'])('refresh preserves the approved %s Portfolio sort without changing native sort or scope',enhancedSort=>{
  const user={user_id:'sort-owner',role:'platform_admin',client_ids:['one']};
  act(()=>root.render(<Harness user={user}/>));
  act(()=>current[1]({enhancedSort,sort:'activity',mine:true,framework:'soc-2'}));
  act(()=>root.render(<Harness user={{...user}}/>));
  expect(current[0]).toMatchObject({enhancedSort,sort:'activity-desc',mine:true,framework:'soc-2'});
  act(()=>root.render(<Harness user={{...user,client_ids:['different']}}/>));
  expect(current[0]).toMatchObject({enhancedSort:'attention',sort:'name',mine:false,framework:'all'});
});
test('an unrecognized saved enhanced sort does not become a new native sort',()=>{
  const user={user_id:'invalid-sort-owner',role:'super_admin',client_ids:[]};
  act(()=>root.render(<Harness user={user}/>));act(()=>current[1]({enhancedSort:'unrecognized',sort:'progress'}));
  act(()=>root.render(<Harness user={{...user}}/>));
  expect(current[0]).toMatchObject({enhancedSort:'attention',sort:'progress'});
});
test('authorization scope change drops old filter identity values',()=>{
  const user={user_id:'a',role:'platform_admin',client_ids:['a']};
  act(()=>root.render(<Harness user={user}/>));
  act(()=>current[1]({search:'old',table:{filters:{grc_lead_id:['old-lead']}}}));
  user.client_ids=['b'];act(()=>root.render(<Harness user={user}/>));
  expect(current[0].search).toBe('');expect(current[0].table.filters).toEqual({});
});

test('two mounted native consumers synchronize scope while keeping text and framework preferences',()=>{
  const user={user_id:'a',role:'super_admin',client_ids:[]}, consumers=[];
  function Consumer({index}){consumers[index]=usePortfolioView(user);return <div>{String(consumers[index][0].mine)}</div>;}
  act(()=>root.render(<><Consumer index={0}/><Consumer index={1}/></>));
  act(()=>consumers[0][1]({search:'ISO',framework:'soc-2',sort:'activity',mine:true}));
  expect(consumers[1][0]).toMatchObject({mine:true,search:'ISO',framework:'soc-2',sort:'activity'});
  act(()=>consumers[1][1]({mine:false}));
  expect(consumers[0][0]).toMatchObject({mine:false,search:'ISO',framework:'soc-2',sort:'activity'});
});


test('selected Nordic programs survive actor refresh and remain isolated by workspace mode',()=>{
  const user={user_id:'framework-owner',role:'platform_admin',workspace_mode:'standard',client_ids:['one','two']};
  act(()=>root.render(<Harness user={user}/>));
  act(()=>current[1]({enhancedPrograms:{one:'one:soc',two:'two:iso'}}));
  act(()=>root.render(<Harness user={{...user}}/>));
  expect(current[0].enhancedPrograms).toEqual({one:'one:soc',two:'two:iso'});
  act(()=>root.render(<Harness user={{...user,workspace_mode:'demo'}}/>));
  expect(current[0].enhancedPrograms).toEqual({});
  act(()=>current[1]({enhancedPrograms:{one:'one:cis'}}));
  act(()=>root.render(<Harness user={{...user}}/>));
  expect(current[0].enhancedPrograms).toEqual({one:'one:soc',two:'two:iso'});
});
