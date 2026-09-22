import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {usePortfolioView} from './usePortfolioView';
let root,container,current;
function Harness({user}){current=usePortfolioView(user);return <div>{current[0].search}</div>;}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
test('navigation retains combined context; a fresh authentication identity does not inherit it',()=>{
  const user={user_id:'a',role:'super_admin',client_ids:[]};
  act(()=>root.render(<Harness user={user}/>));
  act(()=>current[1]({search:'Cyber',mine:true,includeArchived:true,table:{filters:{frameworks:['cmmc']},sort:{key:'name',dir:'desc'}},scroll:320}));
  act(()=>root.render(null));act(()=>root.render(<Harness user={user}/>));
  expect(current[0]).toMatchObject({search:'Cyber',mine:true,includeArchived:true,scroll:320,table:{sort:{key:'name',dir:'desc'}}});
  act(()=>root.render(<Harness user={{...user}}/>));
  expect(current[0]).toMatchObject({search:'',mine:false,table:{filters:{}}});
});
test('authorization scope change drops old filter identity values',()=>{
  const user={user_id:'a',role:'platform_admin',client_ids:['a']};
  act(()=>root.render(<Harness user={user}/>));
  act(()=>current[1]({search:'old',table:{filters:{grc_lead_id:['old-lead']}}}));
  user.client_ids=['b'];act(()=>root.render(<Harness user={user}/>));
  expect(current[0].search).toBe('');expect(current[0].table.filters).toEqual({});
});
