import {unzipSync,strFromU8} from 'fflate';
import catalog from '@catalogs/cmmc.json';
import {buildCmmcWorkspace} from './cmmcWorkspace';
import {buildCmmcExport,downloadCmmcExport} from './cmmcExports';

const name='A & B $& Works';
const note='Inventory <saved> $& coverage';
function model(level=2) {
  const defs=catalog.requirements.filter(def=>level===2 || def.level_one_parent);
  const assessments=defs.map((def,index)=>({definition_id:def.id,framework_key:'cmmc',framework_version:catalog.version,
    framework_assessment_id:'a-'+def.id,client_id:'qa',status:index===0?'needs_attention':'not_assessed',
    implementation:index===0?note:'',related_links:[]}));
  const records={level,client_id:'qa',ssp:{system:'Enclave & operations'},plans:{[defs[0].id]:{milestone:'Correct <inventory> $&',status:'Open'}},
    files:['first','second'].map(id=>({client_id:'qa',evidence_id:id,filename:'Inventory.pdf',linked_type:'framework_assessment',linked_id:'a-'+defs[0].id})),
    posting:{score:0,date:'2026-01-12',scope:'Previously reported scope'}};
  return buildCmmcWorkspace({configuration:{level},assessments},records,{client_id:'qa',name});
}
function xml(parts,path) {
  return new DOMParser().parseFromString(strFromU8(parts[path]),'application/xml');
}
const cell=(doc,ref)=>doc.querySelector('c[r="'+ref+'"]')?.textContent || '';
const date=new Date('2026-11-24T20:00:00Z');
test('SSP contains the saved system, current implementation, linked identities and remediation in the approved document',async()=>{
  const file=await buildCmmcExport('ssp',model(),date);
  const parts=unzipSync(file.bytes), doc=xml(parts,'word/document.xml');
  expect(file.filename).toBe('qa-cmmc-level-2-ssp-draft.docx');
  expect(doc.querySelector('parsererror')).toBeNull();
  for(const saved of [name,'Enclave & operations',note,'POAM-3.1.1','Correct <inventory> $&','Inventory.pdf','first','second','Outstanding draft inputs'])
    expect(doc.documentElement.textContent).toContain(saved);
});
test.each(['poam','sprs'])('%s workbook keeps literal source text, chart templates, formulas and the current saved score',async kind=>{
  const input=model(), parts=unzipSync((await buildCmmcExport(kind,input,date)).bytes);
  const dashboard=xml(parts,'xl/worksheets/sheet1.xml'), detail=xml(parts,'xl/worksheets/sheet2.xml');
  for(const part of [dashboard,detail]) expect(part.querySelector('parsererror')).toBeNull();
  expect(cell(dashboard,'B3')).toContain(name);
  expect(dashboard.querySelector('c[r="B14"] v').textContent).toBe(String(input.score.value));
  expect(detail.documentElement.textContent).toContain(note);
  expect(detail.querySelector('c[t="inlineStr"] f')).toBeNull();
  if (kind==='sprs') expect(cell(dashboard,'L19')).toBe('0');
  else expect(detail.documentElement.textContent).toContain('Correct <inventory> $&');
  for(const path of Object.keys(parts).filter(p=>p.endsWith('.xml') || p.endsWith('.rels'))){
    const body=strFromU8(parts[path]);
    expect(body).not.toMatch(/@@ROWS@@|__GN_[A-Z]|Cyberdyne/);
  }
});
test('printed requirement colors and linked review wording follow the saved state of each row',async()=>{
  const input=model();
  input.rows[0].verification='verified';
  input.rows[0].reviews=[{review_id:'review-1',title:'Inventory review',status:'needs_scheduling'}];
  input.rows[0].policies=[
    {policy_id:'approved',title:'Inventory policy',status:'approved',approval_subject:{subject_id:'saved-approval'}},
    {policy_id:'legacy',title:'Legacy inventory policy',status:'approved'}
  ];
  input.rows[1].status='addressed';
  const doc=xml(unzipSync((await buildCmmcExport('ssp',input,date)).bytes),'word/document.xml');
  const word='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const colors=new Map([...doc.getElementsByTagNameNS(word,'r')].map(run=>[
    run.textContent,run.getElementsByTagNameNS(word,'color')[0]?.getAttributeNS(word,'val')
  ]));
  expect(colors.get('Not implemented')).toBe('983F3D');
  expect(colors.get('Implemented')).toBe('1E6B34');
  expect(colors.get('Verified')).toBe('1E6B34');
  expect(colors.get('Not assessed')).toBe('666D74');
  expect(doc.documentElement.textContent).toContain('Needs Scheduling');
  expect(doc.documentElement.textContent).toContain('Inventory policy · Approved');
  expect(doc.documentElement.textContent).toContain('Legacy inventory policy · Needs Confirmation');
  expect(doc.documentElement.textContent).not.toContain('needs_scheduling');
});
test('Level 1 exports a printable, escaped internal SSP and cannot issue Level 2 workbooks',async()=>{
  const input=model(1);
  const file=await buildCmmcExport('ssp',input,date);
  expect(file.filename).toMatch(/level-1-ssp-draft\.html$/);
  const doc=new DOMParser().parseFromString(strFromU8(file.bytes),'text/html');
  expect(doc.body.textContent).toContain(note);
  expect(doc.body.textContent).toContain('FAR 52.204-21');
  expect(doc.querySelector('saved')).toBeNull();
  for(const kind of ['poam','sprs']) await expect(buildCmmcExport(kind,input,date)).rejects.toThrow('Level 2');
});
test('cancelled client scope cannot initiate download',async()=>{
  await expect(downloadCmmcExport('ssp',model(),()=>false)).rejects.toThrow('current CMMC workspace');
});
