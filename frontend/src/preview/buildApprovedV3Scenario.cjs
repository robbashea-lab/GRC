/* Offline conversion pins both the approved visual reference and its runtime state export. */
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {JSDOM,VirtualConsole} = require('jsdom');
const {approvedV3Scenario} = require('./approvedV3Records.js');
const hash = bytes=>createHash('sha256').update(bytes).digest('hex');
const root = path.join(__dirname, '../../..');
const bytes = fs.readFileSync(process.argv[2]);
const html = fs.readFileSync(path.join(root, 'frontend/public/visual-preview.html'));
const source = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
let result = approvedV3Scenario(source);
if (!result.demo_actor_id || hash(bytes) !== result.state_sha256 || hash(html) !== result.source_sha256) {
  throw Error('Approved reference source fingerprints did not match');
}
// The original export is plain JSON. Recover the approved page's actual Date positions
// in its own realm, while retaining the pinned export's exact values and generated IDs.
const initializer = 'p16Initialize();';
const capture = `CLIENTS.forEach(c=>dashboardPrograms(c));
window.__reviewTemplates=Object.fromEntries(CLIENTS.map(c=>[c.id,Object.fromEntries(
  (WORK[c.id].revs||[]).map(r=>[r.id,revTopic(r)?.T.k||null]))]));
window.__capture=JSON.stringify(connectedState(),function(k,v){return this[k] instanceof Date ? {$date:this[k].toISOString()} : v;});`;
const embedded = html.toString('utf8').replace(initializer,initializer+'\n'+capture);
const dom = new JSDOM(embedded,{url:'https://governara.example.test/',runScripts:'dangerously',virtualConsole:new VirtualConsole()});
let dateTemplate, reviewTemplates;
try {
  dateTemplate=JSON.parse(dom.window.__capture);
  reviewTemplates=JSON.parse(JSON.stringify(dom.window.__reviewTemplates));
} finally {dom.window.close();}
function restoreDateTypes(value,template) {
  if(template && typeof template==='object' && Object.hasOwn(template,'$date')) {
    if(typeof value!=='string'||new Date(value).toISOString()!==value)throw Error('Source date field does not match the runtime shape');
    return {$date:value};
  }
  if(Array.isArray(value)) {
    if(!Array.isArray(template)||template.length!==value.length)throw Error('Source list does not match runtime shape');
    return value.map((v,index)=>restoreDateTypes(v,template[index]));
  }
  if(value && typeof value==='object') {
    if(!template||typeof template!=='object')throw Error('Source object does not match runtime shape');
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,restoreDateTypes(v,template[k])]));
  }
  return value;
}
const projected=restoreDateTypes(source,dateTemplate);
const catalog=require(path.join(root,'shared/catalogs/r4ReviewTemplates.json'));
const known=new Set([...catalog.topics,...catalog.record_guides].map(template=>template.id));
for(const [clientId,work] of Object.entries(projected.work)) for(const review of work.revs||[]) {
  if(!Object.hasOwn(reviewTemplates[clientId],review.id)) throw Error('Approved review missing from the runtime template lookup');
  const template=reviewTemplates[clientId][review.id];
  if(template && !known.has(template)) throw Error('Approved review template is absent from the native catalog: '+template);
  if(template || !review.link) review.nativeTemplateId=template || 'custom';
}
result=approvedV3Scenario(projected);
result.source_state=projected;
const target = path.join(root, 'shared/fixtures/approvedV3Scenario.json');
fs.mkdirSync(path.dirname(target), {recursive:true});
fs.writeFileSync(target, JSON.stringify(result)+'\n');
