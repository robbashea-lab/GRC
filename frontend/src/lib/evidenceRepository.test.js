import {evidenceFolders,folderCounts} from './evidenceRepository';
test('logical paths deduplicate repeated links, retain multiple areas and never infer missing sources',()=>{
  const ref={kind:'reviews',id:'r',available:true,review_type:'backup',title:'Changed title'};
  const folders=evidenceFolders([ref,{...ref,id:'r2'},{kind:'vendors',id:'v',title:'Vendor',available:true},{kind:'risks',id:'foreign',available:false}]);
  expect(folders).toHaveLength(2);expect(folders[0].key).toBe('backup');
  expect(folderCounts([{folders}]).map(f=>f.count)).toEqual([1,1]);
  expect(evidenceFolders([{...ref,available:false}])).toEqual([]);
});
test.each([['tasks','Action Items'],['ai_systems','AI Governance'],['findings','Findings'],['risks','Risks'],['policies','Policies'],['framework_assessments','Frameworks'],['assets','Other']])('%s is organized under %s',(kind,area)=>{
  expect(evidenceFolders([{kind,id:'r',available:true,title:'Record',framework_key:'cis-ig1'}])[0].area).toBe(area);
});
