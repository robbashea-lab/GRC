import {frameworkDashboardPrograms} from './frameworkDashboard';
import {frameworkDashboardFixture} from '../testUtils/frameworkDashboard';

test('mixed ISO/SOC programs retain separate native status positions and destinations',()=>{
  const fixtures=['iso-27001','soc-2'].map(key=>frameworkDashboardFixture(key));
  const clientId='synthetic-mixed',metadata={},programs=[];
  for(const {source} of fixtures){
    const key=source.framework.key;
    metadata[key]={...source,assessments:source.assessments.map(row=>({...row,client_id:clientId}))};
    programs.push({id:clientId+':'+key,key,label:source.framework.label,implementation_position:{...source.implementation_position,program_id:clientId+':'+key}});
  }
  const actual=frameworkDashboardPrograms(programs,metadata,clientId);
  expect(actual.map(program=>program.framework_key)).toEqual(['iso-27001','soc-2']);
  expect(actual.map(program=>program.current)).toEqual(programs.map(program=>program.implementation_position));
  expect(actual.map(program=>program.to)).toEqual(['/compliance/iso-27001?client_id=synthetic-mixed','/compliance/soc-2?client_id=synthetic-mixed']);
  expect(actual.map(program=>program.unit_label)).toEqual(['requirements and controls','criteria']);
  expect(actual[1].verb).toBe('addressed');
});

test.each(['iso-27001','soc-2'])('%s refuses cross-client, old catalog and unenrolled source metadata',framework=>{
  const {client,source}=frameworkDashboardFixture(framework),program={id:client.client_id+':'+framework,key:framework,label:source.framework.label,implementation_position:source.implementation_position};
  const build=metadata=>frameworkDashboardPrograms([program],{[framework]:metadata},client.client_id);
  expect(build(source)).toHaveLength(1);
  expect(build({...source,selected:false})).toEqual([]);
  expect(build({...source,selected:'true'})).toEqual([]);
  expect(build({...source,framework:{...source.framework,version:'old'}})).toEqual([]);
  expect(build({...source,assessments:[{...source.assessments[0],client_id:'foreign'}]})).toEqual([]);
  expect(frameworkDashboardPrograms([{...program,implementation_position:{...program.implementation_position,program_id:'foreign:'+framework}}],{[framework]:source},client.client_id)).toEqual([]);
});
