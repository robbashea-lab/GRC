/** @jest-environment node */
import {JSDOM,VirtualConsole} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

// Exercise the approved document and the actual server-injected hook together.
// Only native delivery callbacks are substituted; the renderers and click
// handlers are the same functions served in the signed-in workspace.
function openEvidencePage(){
  const root=path.join(__dirname,'../../..');
  const html=fs.readFileSync(path.join(root,'frontend/public/visual-preview.html'),'utf8').replace(/\r\n/g,'\n');
  const hook=fs.readFileSync(path.join(root,'backend/approved_v3_page.py'),'utf8').match(/PAGE_HOOK = r"""([\s\S]+?)"""/)[1];
  const marker='p16Initialize();\nif (!location.hash)';
  const expose=`window.inspectEvidence={render:function(cid,program){
    S.clientId=cid;if(program)byId(cid).activeProg=program;renderEvidence();
  },dialog:function(title){openDlg(title,'Another saved record','<p>Keep this dialog</p>','');}};`;
  return new JSDOM(html.replace(marker,'p16Initialize();\n'+hook+'\n'+expose+'\nif (!location.hash)'),{
    url:'https://governara.example.test/#portfolio',runScripts:'dangerously',virtualConsole:new VirtualConsole()});
}

let dom,page,document,inspect,callback,busy,baseline;
beforeAll(()=>{
  dom=openEvidencePage();
  page=dom.window.GoverNaraNativePage;document=dom.window.document;inspect=dom.window.inspectEvidence;
  baseline=page.snapshot();
});
afterAll(()=>dom.window.close());
beforeEach(()=>{
  busy=false;callback=jest.fn().mockResolvedValue({downloaded:false,fileCount:0,referenceCount:2,
    message:'This selection has no stored files to download. 2 reference-only records remain in the Library; no file contents were supplied for them.'});
  page.configure({busy:()=>busy,command:()=>{},persist:()=>true,downloadEvidenceArchive:callback});
  page.apply(baseline);
  document.getElementById('dlg-scrim').hidden=true;
  document.getElementById('toast').hidden=true;
  inspect.render('prestige','soc');
});
const settle=async()=>{for(let index=0;index<8;index++)await Promise.resolve();};
function clickArchive(folder='__all'){
  const button=[...document.querySelectorAll('#v-client [data-action="ev-zip"]')].find(node=>node.dataset.val===folder);
  expect(button).toBeDefined();button.click();
  return document.querySelector('#dlg [data-action="ev-zip-go"]');
}

test('Evidence keeps its approved cards and changes current figures with the selected native framework',()=>{
  const state=page.snapshot(),library=state.evidence.prestige;
  library.nativeSummary={files:3,recent:2,recentSince:'2026-08-28',rp:'1',rpOf:'4'};
  library.nativeSummaryByProgram={soc:{...library.nativeSummary,fwLabel:'Framework files',fwVal:'2',fwOf:null},
    iso:{...library.nativeSummary,fwLabel:'Framework files',fwVal:'1',fwOf:null}};
  page.apply(state);
  inspect.render('prestige','soc');
  const cards=()=>[...document.querySelectorAll('#v-client .kchip')];
  expect(cards()).toHaveLength(4);
  expect(cards().map(card=>card.querySelector('b.num').textContent)).toEqual(['3','2','2','1 of 4']);
  expect(cards()[1].querySelector('.kc').textContent).toBe('Uploaded since Aug 28');
  expect(cards()[1].title).toBe('Added in the last 90 days: Uploaded since Aug 28');
  expect(document.querySelector('#v-client .folder-grid')).not.toBeNull();
  const folders=document.querySelectorAll('#v-client .ev-folder').length;
  inspect.render('prestige','iso');
  expect(cards()[2].querySelector('b.num').textContent).toBe('1');
  expect(document.querySelectorAll('#v-client .ev-folder')).toHaveLength(folders);
  expect(document.querySelector('#v-client').textContent).not.toContain('Uploaded since Aug 19');
});

test.each(['__all','Reviews'])('the %s ZIP dialog retains the approved structure and delivers the exact client and folder',async folder=>{
  const go=clickArchive(folder);
  expect(go).not.toBeNull();
  expect([...document.querySelector('#dlg').children].map(node=>node.className)).toEqual(['m-head','m-body','m-foot']);
  expect(document.querySelector('#dlg .m-body').textContent).toContain('Reference-only records have no file contents');
  expect(go.textContent).toBe('Download ZIP');
  go.click();await settle();
  expect(callback.mock.calls).toEqual([['prestige',folder]]);
  expect(document.getElementById('dlg-scrim').hidden).toBe(true);
  expect(document.getElementById('toast-msg').textContent).toContain('no stored files to download');
  expect(document.getElementById('toast-msg').textContent).not.toContain('ZIP download started');
});

test('a pending archive ignores duplicate clicks and cannot close a different client’s dialog',async()=>{
  let finish;
  callback.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const go=clickArchive('Reviews');go.click();go.click();await settle();
  expect(callback.mock.calls).toEqual([['prestige','Reviews']]);expect(go.disabled).toBe(true);
  inspect.render('brawndo','cis');inspect.dialog('Another client’s record');
  finish({downloaded:true,fileCount:1,message:'ZIP download started: 1 verified file.'});await settle();
  expect(document.getElementById('dlg-scrim').hidden).toBe(false);
  expect(document.getElementById('dlg-title').textContent).toBe('Another client’s record');
  expect(document.getElementById('toast').hidden).toBe(true);
});

test('a pending native save prevents a second archive intent from leaving the document',async()=>{
  const go=clickArchive('Reviews');busy=true;go.click();await settle();
  expect(callback).not.toHaveBeenCalled();
  expect(document.getElementById('dlg-scrim').hidden).toBe(false);
});

test('an archive finishing later cannot close another dialog opened for the same client',async()=>{
  let finish;
  callback.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  clickArchive('Reviews').click();await settle();
  inspect.dialog('A different saved record');
  finish({downloaded:true,fileCount:1,message:'ZIP download started: 1 verified file.'});await settle();
  expect(document.getElementById('dlg-scrim').hidden).toBe(false);
  expect(document.getElementById('dlg-title').textContent).toBe('A different saved record');
});

test('an archive failure after a client switch cannot display the previous client’s message',async()=>{
  let fail;
  callback.mockImplementation(()=>new Promise((_,reject)=>{fail=reject;}));
  clickArchive('Reviews').click();await settle();
  inspect.render('brawndo','cis');inspect.dialog('Another client’s record');
  fail(Error('The former client’s evidence selection changed.'));await settle();
  expect(document.getElementById('dlg-title').textContent).toBe('Another client’s record');
  expect(document.getElementById('dlg-scrim').hidden).toBe(false);
  expect(document.getElementById('toast').hidden).toBe(true);
});

test('native multi-folder membership governs the actual folder drawer and its ZIP action',async()=>{
  const state=page.snapshot(),library=state.evidence.prestige;
  library.rows=[
    'Native review proof.txt^v1 · 4 B^Report^Review^Risk review^1^Operator^11/25^native-record^ev-review',
    'Native action proof.txt^v1 · 4 B^Report^Action item^Corrective action^0^Operator^11/25^native-record^ev-action',
    'Unclassified reference^Reference only^Report^Vendor^Unavailable source^0^Operator^11/25^native-record^ev-unassigned',
  ].join('\n');
  // This Reviews + Risks membership is also asserted from a real native upload
  // and catalog response in test_approved_v3_lifecycle.py.
  library.nativeFoldersByEvidenceId={'ev-review':['Reviews','Risks'],'ev-action':['Action Items'],'ev-unassigned':['Unassigned']};
  library.folders={...library.folders,Reviews:1,Risks:1,'Action Items':1,Findings:0,'Needs classification':1};
  page.apply(state);inspect.render('prestige','soc');
  const open=folder=>{
    const button=[...document.querySelectorAll('#v-client [data-action="ev-open-folder"]')].find(node=>node.dataset.val===folder);
    expect(button).toBeDefined();button.click();
    return [...document.querySelectorAll('#drawer .ev-frow')].map(node=>node.textContent);
  };
  expect([...document.querySelectorAll('#v-client [data-action="ev-open-folder"]')]
    .find(node=>node.dataset.val==='Risks').querySelector('.num').textContent).toBe('1');
  expect(open('Risks')).toEqual([expect.stringContaining('Native review proof.txt')]);
  expect(open('Findings')).toEqual([]); // A Task alone does not prove a Finding relationship.
  expect(open('Needs classification')).toEqual([expect.stringContaining('Unclassified reference')]);
  open('Risks');
  document.querySelector('#drawer [data-action="ev-zip"]').click();
  document.querySelector('#dlg [data-action="ev-zip-go"]').click();await settle();
  expect(callback.mock.calls).toEqual([['prestige','Risks']]);
});
