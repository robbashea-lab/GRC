/** @jest-environment node */
import {JSDOM,VirtualConsole} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

test('Start assessment requests the exact saved record instead of opening an optimistic decision form',()=>{
  const root=path.join(__dirname,'../../..');
  const source=fs.readFileSync(path.join(root,'frontend/public/visual-preview.html'),'utf8').replace(/\r\n/g,'\n');
  const hook=fs.readFileSync(path.join(root,'backend/approved_v3_page.py'),'utf8').match(/PAGE_HOOK = r"""([\s\S]+?)"""/)[1];
  const expose="window.openAssessmentFixture=function(){S.clientId='brawndo';S.route='client';S.sub='ai';openAIDrawer(CL.brawndo.ai[0].name);};";
  const dom=new JSDOM(source.replace('p16Initialize();\nif (!location.hash)','p16Initialize();\n'+hook+'\n'+expose+'\nif (!location.hash)'),{
    url:'https://governara.example.test/clients#portfolio',runScripts:'dangerously',virtualConsole:new VirtualConsole()});
  try{
    const page=dom.window.GoverNaraNativePage,doc=dom.window.document;
    const state=page.snapshot(),row=state.records.brawndo.ai[0];
    row.st='Pending assessment';
    const destination='/ai-governance?ai_system_id=exact-ai&client_id=exact-client',openAiAssessment=jest.fn(()=>destination);
    const persist=jest.fn();
    page.configure({openAiAssessment,busy:()=>false,command:()=>{},persist});
    page.apply(state);page.actor({user_id:'qa',name:'QA',role:'super_admin'},['brawndo']);
    dom.window.openAssessmentFixture();
    const action=doc.querySelector('#drawer [data-action="ai-assess"]');
    expect(action.textContent).toBe('Start assessment');
    action.click();
    expect(openAiAssessment).toHaveBeenCalledWith('brawndo',row.wfId);
    expect(doc.querySelector('#dlg a').getAttribute('href')).toBe(destination);
    expect(doc.querySelector('#dlg').textContent).not.toContain('Record decision');
    expect(persist).not.toHaveBeenCalled();
  }finally{dom.window.close();}
});
