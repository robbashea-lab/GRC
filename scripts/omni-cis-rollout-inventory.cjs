// Read-only release inventory of the approved reference; never changes product records.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'shared/catalogs', name), 'utf8'));
const canonical = read('cisIG1.json');
const program = read('guidedCisProgramV2.json');
const control = read('guidedControl1.json');
const current = read('guidedControl1V3.json');
const legacy = read('guidedAssessmentPilot.json');
const additional = read('guidedControl1Additional.json');
const rows = canonical.requirements.map(row => {
  const definition = current.definitions[row.id] || control.definitions[row.id] || program.definitions[row.id];
  if (!definition) throw new Error('Missing guide: ' + row.id);
  const version = current.definitions[row.id] ? current.version : control.definitions[row.id] ? control.version : program.version;
  const authoredQuestions = current.safeguards[row.id] || additional.safeguards[row.id] || legacy.safeguards[row.id];
  return {
    id: row.id, title: row.title, minimumGroup: row.implementation_group,
    applicableGroups: [1, 2, 3].filter(g => g >= row.implementation_group), source: row.source,
    currentQuestionVersion: version,
    currentGuide: row.id === '1.1' ? 'approved complete summary / direct native save' : row.id === '1.2' ? 'older refined summary / native draft apply' : 'legacy guide / native draft apply',
    questionFields: authoredQuestions ? authoredQuestions.map(q => ({id:q.id, type:q.type, critical:q.critical, rows:q.rows, when:q.when})) : [
      {id:'practice',type:'select',critical:true},
      ...[false,true].flatMap(conditional => {
        const elements = definition.elements.filter(e => e.conditional === conditional);
        const result=[];
        for(let offset=0;offset<elements.length;offset+=5) result.push({id:(conditional?'conditional':'requirements')+'_'+offset,type:'matrix',critical:true,criterionIds:elements.slice(offset,offset+5).map(e=>e.id),when:{practice:['Yes','Partially']}});
        return result;
      }),
      ...['existing','scope_reason','system','owner','operation','evidence','gaps','unknowns'].map(id=>({id,type:'text',critical:false}))
    ],
    activation: 'general guided CIS catalog available; approved focused UI/direct writer gated to Brawndo IG1 Control1, exact complete summary to1.1',
    evaluator: row.control === 1 ? 'generateResult Control1 + focusedResult when focused pilot' : 'generateResult program2 atomic elements / aggregate practice root',
    nativeSave: 'FrameworkDrawer existing authorized PATCH / CAS / guided source; direct callback exact1.1 only',
    contentReview: 'pending content owner', implementation: 'pending rollout', independentReview:'pending', defectStatus:'open phase gates'
  };
});
if (rows.length !== 153 || new Set(rows.map(r=>r.id)).size !==153) throw new Error('Invalid unique coverage');
const result={reference:'83d88e3cbc31d618060c4e094335963f5bacf096',frameworkVersion:'8.1',uniqueDefinitions:153,cumulativeCounts:[1,2,3].map(g=>rows.filter(r=>r.minimumGroup<=g).length),approvedCompleteNativeSummaryCount:1,rows};
fs.writeFileSync(path.join(root,'docs/omni-cis-rollout/reference-inventory.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({unique:rows.length,counts:result.cumulativeCounts,approvedCompleteNativeSummaryCount:1}));
