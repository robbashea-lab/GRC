import {strFromU8,unzipSync} from 'fflate';
import catalog from '@catalogs/cmmc.json';
import api from '@/lib/api';
import {loadCmmcPackageMaterials,buildCmmcPackageFiles} from './ReportPackageCmmc';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()}}));
const folder='07_CMMC-SSP-POAM-and-score/';
const names=['System-Security-Plan_working-draft.docx','Plan-of-action-and-milestones.xlsx','SPRS-score.xlsx'];
const options={clientId:'qa',frameworkKey:'cmmc',asOf:'2026-11-24',signal:new AbortController().signal,isCurrent:()=>true};
function packet(level=2) {
  const assessments=catalog.requirements.filter(def=>level===2 || def.level_one_parent).map(def=>({
    definition_id:def.id,framework_key:'cmmc',framework_version:catalog.version,framework_assessment_id:'assessment-'+def.id,client_id:'qa',status:'not_assessed',related_links:[],
  }));
  return {data:{configuration:{level},assessments},records:{client_id:'qa',level,revision:3,ssp:{system:'Package QA system'}},client:{client_id:'qa',name:'Package QA client'}};
}
beforeAll(()=>{
  if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:require('crypto').webcrypto,configurable:true});
});
beforeEach(()=>{api.get.mockReset();api.post.mockReset();});

test('the ZIP uses the dated, authorized native SSP, POA&M and SPRS files for the selected Level 2 client',async()=>{
  const data=packet();api.get.mockResolvedValue({data});api.post.mockResolvedValue({data});
  const materials=await loadCmmcPackageMaterials(options);
  expect(materials.files.map(file=>file.path)).toEqual(names.map(name=>folder+name));
  const files=await buildCmmcPackageFiles(materials,options);
  expect(Object.keys(files)).toEqual(materials.files.map(file=>file.path));
  expect(api.post.mock.calls.map(([url,body,config])=>[url,body.client_id,body.level,body.kind,config.signal])).toEqual(
    ['ssp','poam','sprs'].map(kind=>['/frameworks/cmmc/workbook/export','qa',2,kind,options.signal]));
  for(const [index,path] of Object.keys(files).entries()) {
    const entries=unzipSync(files[path]),doc=index===0?'word/document.xml':'xl/worksheets/sheet1.xml';
    expect(strFromU8(entries[doc])).toContain('Package QA client');
  }
  const repeated=await buildCmmcPackageFiles(materials,options);
  expect(Object.keys(files).every(path=>Buffer.from(files[path]).equals(Buffer.from(repeated[path])))).toBe(true);
});

test('other frameworks and Level 1 omit the three Level 2 files, and another client is rejected',async()=>{
  expect(await loadCmmcPackageMaterials({...options,frameworkKey:'soc-2'})).toBeNull();
  expect(api.get).not.toHaveBeenCalled();
  api.get.mockResolvedValue({data:packet(1)});
  expect(await loadCmmcPackageMaterials(options)).toBeNull();
  await expect(loadCmmcPackageMaterials({...options,clientId:'another'})).rejects.toThrow('verified for this client');
  expect(api.post).not.toHaveBeenCalled();
});

test('access or source changes stop file assembly before a partial ZIP can be returned',async()=>{
  const data=packet();api.get.mockResolvedValue({data});
  const materials=await loadCmmcPackageMaterials(options);
  await expect(buildCmmcPackageFiles(materials,{...options,isCurrent:()=>false})).rejects.toThrow('workspace changed');
  expect(api.post).not.toHaveBeenCalled();
  api.post.mockRejectedValueOnce(new Error('Access denied'));
  await expect(buildCmmcPackageFiles(materials,options)).rejects.toThrow('Access denied');
  api.post.mockResolvedValueOnce({data}).mockResolvedValueOnce({data:{...data,records:{...data.records,ssp:{system:'Updated system'}}}});
  await expect(buildCmmcPackageFiles(materials,options)).rejects.toThrow('saved CMMC workbook changed');
  expect(api.post.mock.calls.map(([,body])=>body.kind)).toEqual(['ssp','ssp','poam']);
});
