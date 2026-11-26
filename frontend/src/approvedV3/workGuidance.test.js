/** @jest-environment node */
import {prepareReviewGuide,sourceReviewGuide,downloadApprovedEvidence} from './workGuidance';
import {JSDOM,VirtualConsole} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const row={client_id:'a',review_id:'native-review',source_record_id:'r1',current_occurrence_id:'occ',updated_at:'v1'};
const guide={occurrence_id:'occ',expected_updated_at:'v1',contract_token:'token',steps:[
  {step_id:'one',text:'Review the inventory',who:'spm',operating:true,support:'Inventory file'},
  {step_id:'two',text:'Confirm the latest sample',who:'client'},
],results:[{step_id:'two',result:'Exception',reason:'Sample is absent'}],
service_context:[{name:'Inventory',responsibility:'cl',responsibility_label:'Client',tools:[{name:'NinjaOne'}]}]};

test('opens exactly the authorized active occurrence and restores answers by stable step IDs',async()=>{
  const api={get:jest.fn().mockResolvedValue({data:guide})},page={setReviewGuide:jest.fn()};
  const context={api,page,records:{reviews:[{...row,client_id:'b',review_id:'other'},row]},clientId:'a',sourceId:'s',reviewId:'r1'};
  expect(await prepareReviewGuide(context)).toBe(true);
  expect(api.get).toHaveBeenCalledWith('/reviews/native-review/completion-guide');
  expect(page.setReviewGuide.mock.calls[0]).toEqual(['s','r1',expect.objectContaining({
    st:{1:'Exception'},note:{1:'Sample is absent'},steps:[expect.objectContaining({step_id:'one',op:true}),expect.objectContaining({step_id:'two'})],
    serviceContext:[{name:'Inventory',resp:'cl',responsibility:'Client',tools:['NinjaOne']}],
  })]);
  expect(await prepareReviewGuide({...context,reviewId:'historical-id'})).toBe(false);
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(()=>sourceReviewGuide({...guide,expected_updated_at:'v2'},row)).toThrow('saved review changed');
  expect(()=>sourceReviewGuide({...guide,steps:[guide.steps[0],guide.steps[0]]},row)).toThrow('duplicate step');
});

test('the approved drawer renders native steps, preserves empty answers, and attaches a real file input',()=>{
  const root=path.join(__dirname,'../../..');
  const html=fs.readFileSync(path.join(root,'frontend/public/visual-preview.html'),'utf8').replace(/\r\n/g,'\n');
  const python=fs.readFileSync(path.join(root,'backend/approved_v3_page.py'),'utf8');
  const hook=python.match(/PAGE_HOOK = r"""([\s\S]+?)"""/)[1];
  const marker='p16Initialize();\nif (!location.hash)';
  const expose=`window.inspectGuide=function(){
    var c=CLIENTS.find(function(client){return client.id==='brawndo';}),r=WORK[c.id].revs[0];
    S.clientId=c.id;r.nativeOccurrenceId='occ';
    return {id:r.id,open:function(){openRevDrawer(r.id);},data:function(){return connectedChecklist(c,r);},
      evidence:function(){formDlg('Attach evidence',r.title,evFields(),'Attach',function(){});},
      files:function(rows){EVID[c.id].nativeFiles=rows;},client:c.id};
  };`;
  const doc=html.replace(marker,'p16Initialize();\n'+hook+'\n'+expose+'\nif (!location.hash)');
  const dom=new JSDOM(doc,{url:'https://governara.example.test/#portfolio',runScripts:'dangerously',virtualConsole:new VirtualConsole()});
  try {
    const {window}=dom,view=window.inspectGuide();
    window.GoverNaraNativePage.setReviewGuide('brawndo',view.id,sourceReviewGuide(guide,row));
    view.open();
    expect(window.document.getElementById('drawer').textContent).toContain('Confirm the latest sample');
    expect(view.data().steps.map(step=>step.result)).toEqual([null,'Exception']);
    expect(view.data().requiredSupport).toEqual(['Inventory file']);
    view.evidence();
    const fileInput=window.document.getElementById('f-nativeEvidenceFile');
    expect(fileInput.type).toBe('file');
    Object.defineProperty(fileInput,'files',{value:[new window.File(['test'],'inventory.txt')]});
    fileInput.dispatchEvent(new window.Event('change',{bubbles:true}));
    expect(window.document.getElementById('f-name').value).toBe('inventory.txt');
    const download=jest.fn().mockResolvedValue(true);
    window.GoverNaraNativePage.configure({busy:()=>false,downloadEvidence:download,command:()=>{},persist:()=>{}});
    view.files([{id:'a',name:'inventory.txt',filename:'inventory.txt',available:true,version:2},
      {id:'b',name:'inventory.txt',filename:'inventory.txt',available:false,version:1}]);
    const link=window.document.createElement('button');
    link.dataset.action='ev-file';link.dataset.id='inventory.txt';window.document.body.append(link);link.click();
    const buttons=window.document.querySelectorAll('[data-action="native-evidence-download"]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].dataset.id).toBe('a');
    expect(window.document.querySelector('#dlg').textContent).toContain('Reference only');
  } finally {dom.window.close();}
});

test('stored evidence references and foreign clients cannot request file bytes',async()=>{
  const api={get:jest.fn()},records={evidence:[{client_id:'other',evidence_id:'real',size:7,sha256:'a'.repeat(64)},
    {client_id:'s',evidence_id:'ref',file_available:false}]};
  for(const evidenceId of ['real','ref']) await expect(downloadApprovedEvidence({api,records,clientId:'s',evidenceId})).rejects.toThrow('no downloadable file');
  expect(api.get).not.toHaveBeenCalled();
});
