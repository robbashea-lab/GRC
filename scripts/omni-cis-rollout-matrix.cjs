const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const directory = 'docs/omni-cis-rollout/';
const canonical = read('shared/catalogs/cisIG1.json').requirements;
const reviews = [1, 2, 3].flatMap(group => read(directory + `ig${group}-review.json`).rows);
const cases = [1, 2, 3].flatMap(group => read(directory + `ig${group}-status-cases.json`).cases);
const reviewed = new Map(reviews.map(row => [row.id, row]));
if (reviews.length !== 153 || reviewed.size !== 153) throw new Error('Incomplete or duplicated content review');
const rows = canonical.map(row => {
  const content = reviewed.get(row.id);
  if (!content?.atomic_requirements?.length) throw new Error('Missing atomic requirements: ' + row.id);
  const version = row.id === '1.1' ? 'cis-v8.1-control1-3' : row.id === '1.2'
    ? 'cis-v8.1-control1-4' : row.control === 1 ? 'cis-v8.1-control1-2' : 'cis-v8.1-program-3';
  return {id:row.id, title:row.title, minimumGroup:row.implementation_group,
    applicableGroups:[1,2,3].filter(group => group >= row.implementation_group),
    officialSource:row.source, navigator:'https://www.cisecurity.org/controls/cis-controls-navigator',
    questionVersion:version, guide:'approved shared OmniBot components',
    nativeSave:'Existing authorized framework assessment PATCH, reviewed exact multiline text and separate status; tenant/CAS/version guards retained',
    contentReview:'Source review authored; independent final review pending',
    implementation:'Integrated current content; runtime regression verification pending',
    independentReview:'pending', defectStatus:'See defect-log.md; release gates remain open',
    testCaseReferences:cases.filter(item => item.safeguard_id === row.id).map(item => item.id),
    sourceQuestionStatusSummaryReview:content};
});
const counts = [1,2,3].map(group => rows.filter(row => row.minimumGroup <= group).length);
if (String(counts) !== '56,130,153') throw new Error('Incorrect cumulative membership');
const matrix = {reference:'83d88e3cbc31d618060c4e094335963f5bacf096',
  frameworkVersion:'8.1', uniqueSafeguards:rows.length, cumulativeCounts:counts,
  requiredRenderedPlacements:counts.reduce((sum,count) => sum+count,0),
  authoredStatusCases:cases.length, execution:'Authored coverage is separate from automated and hosted execution; see verification evidence', rows};
fs.writeFileSync(path.join(root,directory,'coverage-matrix.json'),JSON.stringify(matrix,null,2)+'\n');
console.log(JSON.stringify({unique:rows.length,counts,authoredCases:cases.length}));
