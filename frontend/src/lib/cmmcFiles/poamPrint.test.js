import {strFromU8,unzipSync} from 'fflate';
import catalog from '@catalogs/cmmc.json';
import {buildCmmcWorkspace} from '../cmmcWorkspace';
import {buildCmmcExport} from '../cmmcExports';

async function workbookFor(gap, exceptions = {}) {
  const client = {client_id:'qa-print',name:'North Shore QA'};
  const assessments = catalog.requirements.map(def => ({
    client_id:client.client_id,definition_id:def.id,framework_key:'cmmc',framework_version:catalog.version,
    framework_assessment_id:'assessment-'+def.id,status:def.id===gap?'needs_attention':'not_assessed',
  }));
  const model = buildCmmcWorkspace({configuration:{level:2},assessments},{client_id:client.client_id,level:2,exceptions},client);
  const archive = unzipSync((await buildCmmcExport('poam',model)).bytes);
  return path => new DOMParser().parseFromString(strFromU8(archive[path]),'application/xml');
}

test('an empty score tier prints once and keeps all editable columns and filters', async () => {
  const xml = await workbookFor('3.1.1');
  const workbook = xml('xl/workbook.xml');
  const scope = (name,index) => workbook.querySelector(`definedName[name="${name}"][localSheetId="${index}"]`).textContent;

  for (const [index,tier] of [[2,'3-point'],[3,'1-point']]) {
    const sheet = xml('xl/worksheets/sheet'+(index+1)+'.xml');
    expect(scope('_xlnm.Print_Area',index)).toBe("'"+tier+"'!$A$1:$G$4");
    expect(scope('_xlnm._FilterDatabase',index)).toBe("'"+tier+"'!$A$4:$R$4");
    expect(sheet.querySelector('autoFilter').getAttribute('ref')).toBe('A4:R4');
    expect(sheet.querySelector('c[r="R4"]').textContent).toBe('Closeout note');
  }
  expect(scope('_xlnm.Print_Area',1)).toBe("'5-point'!$A$4:$R$5");
  expect(scope('_xlnm.Print_Area',4)).toBe("'Scoring Review and SSP'!$A$4:$R$113");
});

test.each([[{},5],[{'3.13.11':{assessed_version:'',value:'encrypted-not-fips'}},3]])(
  'the encryption control appears on its documented score sheet',async (exceptions,expectedSheet) => {
    const xml = await workbookFor('3.13.11', exceptions);
    const threePoint = xml('xl/worksheets/sheet3.xml');
    expect(threePoint.querySelector('c[r="A2"]').textContent).toContain('Until its point value is confirmed');
    const sheet = xml('xl/worksheets/sheet'+expectedSheet+'.xml');
    expect(sheet.documentElement.textContent).toContain('POAM-3.13.11');
  });
