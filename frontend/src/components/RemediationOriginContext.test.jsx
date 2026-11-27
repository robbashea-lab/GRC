import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import IsoAuditWorkspace from './IsoAuditWorkspace';
import ReviewDrawer from './ReviewDrawer';
import RecordDrawer from './RecordDrawer';
import api from '@/lib/api';
import {blankAuditItem,initialAuditState} from '@/lib/isoAudit';

let mockAuth,mockOrg,mockSearchParams;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/brawndoFullRecord',()=>({useBrawndoFullRecord:()=>false}));
jest.mock('@/lib/api',()=>({__esModule:true,API:'/api',PREVIEW_MODE:true,
  default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},formatError:error=>error.message}));
jest.mock('./RecordDrawer',()=>({__esModule:true,default:jest.fn(()=>null)}));
jest.mock('react-router-dom',()=>({
  useSearchParams:()=>require('react').useState(mockSearchParams),
  Link:({children,to})=><a href={to}>{children}</a>,useNavigate:()=>jest.fn(),
}),{virtual:true});
jest.mock('sonner',()=>({toast:{error:jest.fn(),success:jest.fn()}}));

const CID='demo_dunder',AID='fw_demo_dunder_assessment_iso-27001_A.8.13';
const FID='origin-finding',TID='origin-action',RID='origin-review',OID='origin-review-2024-06-21';
let root,host,review,related,assessment,onSaved;
const click=node=>act(async()=>{expect(node).toBeTruthy();node.click();});
const button=(scope,label)=>[...scope.querySelectorAll('button')].find(node=>node.textContent===label);
const ticket=()=>document.querySelector(`[aria-label="Remediation tickets"] [data-ticket-id="finding:${FID}"]`);

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  mockAuth={user:{user_id:'operator',role:'super_admin',status:'active',workspace_mode:'demo'},workspaceMode:'demo',loading:false};
  const client={client_id:CID,name:'Dunder Mifflin',environment:'Demo',status:'active'};
  mockOrg={currentClientId:CID,currentClient:client,clients:[client],loading:false};
  mockSearchParams=new URLSearchParams(`package=operations-improvement&audit_occurrence=${OID}&audit_year=2024`);
  assessment={framework_assessment_id:AID,client_id:CID,framework_key:'iso-27001',definition_id:'A.8.13',status:'addressed',title:'Backup implementation'};
  const finding={finding_id:FID,client_id:CID,title:'Historical recovery gap',description:'Changed integration needed a full restore sample.',
    status:'closed',severity:'high',owner_id:'operator',primary_task_id:TID,framework_assessment_id:AID,review_id:RID,occurrence_id:OID};
  const task={task_id:TID,client_id:CID,title:'Validate the changed recovery path',finding_id:FID,framework_assessment_id:AID,
    review_id:RID,occurrence_id:OID,status:'done',priority:'high',assignee_id:'operator'};
  const audit={...initialAuditState('operations-improvement'),items:{'A-8-13':{...blankAuditItem(),
    status:'reviewed',result:'nonconformity',notes:'Original audit result retained.',finding_ids:[FID]}}};
  const occurrence={review_id:RID,client_id:CID,occurrence_id:OID,title:'Recovery audit',status:'completed',review_type:'requirements',
    due_date:'2024-06-21',completed_at:'2024-06-21T00:00:00.000Z',owner_id:'operator',recurrence:'annual',iso_audit:audit};
  review={review_id:RID,client_id:CID,title:'Recovery audit',review_type:'requirements',status:'upcoming',owner_id:'operator',
    due_date:'2027-06-21',recurrence:'annual',current_occurrence_id:'next-occurrence',updated_at:'2026-06-21T00:00:00.000Z',
    iso_audit:initialAuditState('operations-improvement',4),occurrences:[occurrence]};
  related={findings:[finding],tasks:[task],framework_assessments:[assessment],reviews:[],risks:[],policies:[],vendors:[],evidence:[]};
  api.get.mockReset();api.post.mockReset();api.patch.mockReset();RecordDrawer.mockClear();onSaved=jest.fn();
  api.get.mockImplementation(async path=>({data:path==='/iso-audit'
    ?{program:{status:'active',activated_at:'2024-03-18',configuration:{start_date:'2024-03-18'}},reviews:[review]}
    :path==='/related'?related
      :path===`/reviews/${RID}/history`?review.occurrences
        :path===`/clients/${CID}/members`?[{user_id:'operator',name:'Authorized operator'}]
          :path==='/evidence/catalog'?{items:[],total:0,page:1,page_size:25}:[]}));
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.clearAllMocks();});

async function openSummary(caller){
  if(caller==='audit workpaper'){
    await act(async()=>root.render(<IsoAuditWorkspace clientId={CID}/>));
    await click(button(host,'Expand all audit areas'));
    await click(host.querySelector('[data-audit-item="A-8-13"]'));
    await click(button(document,'Findings'));
  }else{
    await act(async()=>root.render(<ReviewDrawer open record={review} clientId={CID}
      initialValues={{occurrence:review.occurrences[0]}} onOpenChange={()=>{}} onSaved={onSaved}/>));
    await click(button(document,'Related'));
    // Native Review summaries hide closed Findings until explicitly requested.
    await click([...document.querySelectorAll('button')].find(node=>node.textContent.startsWith('Show completed / closed records')));
  }
  expect(ticket()).toBeTruthy();
}

describe.each(['audit workpaper','Review Related'])('%s assessment-origin context',caller=>{
  test.each(['same-client','missing','same-ID foreign'])('%s origin preserves native availability and navigation',async state=>{
    if(state==='missing')related.framework_assessments=[];
    if(state==='same-ID foreign')related.framework_assessments=[{...assessment,client_id:'demo_prestige',title:'Foreign assessment title'}];
    const before=JSON.stringify({review,related});
    await openSummary(caller);
    const row=ticket(),origin=button(row,'ISO 27001 Assessment → A.8.13');
    if(state==='same-client'){
      expect(origin).toBeTruthy();expect(row.textContent).not.toContain('Assessment unavailable');
      await click(origin);
      expect(RecordDrawer.mock.calls.at(-1)[0]).toMatchObject({kind:'framework_assessments',record:assessment,clientId:CID,open:true});
    }else{
      expect(origin).toBeUndefined();expect(row.textContent).toContain(`Assessment unavailable · ${AID} · unavailable`);
      expect(row.textContent).not.toContain('Foreign assessment title');
      expect(button(row,'Recovery audit')).toBeUndefined();expect(RecordDrawer).not.toHaveBeenCalled();
    }
    expect(api.get).toHaveBeenCalledWith('/related',expect.objectContaining({params:{entity_type:'reviews',entity_id:RID,occurrence_id:OID}}));
    expect(JSON.stringify({review,related})).toBe(before);
    expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();expect(onSaved).not.toHaveBeenCalled();
  });
});
