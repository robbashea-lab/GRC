// Compare all executable application source to the stacked base, allowing only named color maps.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const parser=require('@babel/parser');
const root=path.resolve(__dirname,'../../..'),base=process.argv[2];
assert.match(base||'',/^[a-f0-9]{40}$/,'Supply the exact stacked base commit');
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
const files=git(['diff','--name-only',base,'--','frontend/src','backend','shared']).trim().split('\n').filter(Boolean);
const allowed={'frontend/src/components/StatusBadge.jsx':['TONE_BY_STATUS'],'frontend/src/pages/ClientDirectory.jsx':['TONE'],'frontend/src/components/CisStatus.jsx':['CIS_TONE'],'frontend/src/components/ClientWorkDashboard.jsx':[]};
const clean=(value,parent)=>{
  if(Array.isArray(value))return value.map(v=>clean(v,parent));
  if(!value||typeof value!=='object')return value;
  const out={};for(const [k,v]of Object.entries(value)){if(['start','end','loc','extra','comments','leadingComments','trailingComments','innerComments','tokens'].includes(k))continue;out[k]=clean(v,value);}
  return out;
};
const ast=(source,maps,file)=>{
  if(file==='frontend/src/pages/ClientDirectory.jsx')source=source.replace("t.total ? TONE[key] || tone : 'clear'","t.total ? tone : 'clear'");
  const tree=parser.parse(source,{sourceType:'module',plugins:['jsx']});
  if(file==='frontend/src/components/ClientWorkDashboard.jsx'){
    tree.program.body=tree.program.body.filter(n=>!(n.type==='ImportDeclaration'&&n.source.value==='./StatusBadge')&&!(n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id?.name==='STATUS_TONE')));
    function presentation(node){if(!node||typeof node!=='object')return;if(node.type==='JSXOpeningElement')node.attributes=node.attributes.filter(a=>a.name?.name!=='className');if(['JSXOpeningElement','JSXClosingElement'].includes(node.type)&&node.name?.name==='StatusPill')node.name.name='span';for(const v of Object.values(node))if(v&&typeof v==='object'){if(Array.isArray(v))v.forEach(presentation);else presentation(v);}}
    presentation(tree);
  }
  function visit(node){if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&maps.includes(node.id?.name))node.init=null;for(const v of Object.values(node))if(v&&typeof v==='object'){if(Array.isArray(v))v.forEach(visit);else visit(v);}}
  visit(tree);return clean(tree);
};
let executable=0;
for(const file of files){
  if(/\.test\.[jt]sx?$/.test(file))continue;
  assert.ok(!file.startsWith('backend/')&&!file.startsWith('shared/'),'Backend or catalog changed: '+file);
  const current=fs.readFileSync(path.join(root,file),'utf8');
  if(file.endsWith('.css')){
    const added=git(['diff','--unified=0',base,'--',file]).split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++')).join('\n');
    const declarations=added.replace(/\.bd-status\{font-size:var\(--register-detail\);text-transform:none;\}/g,'');
    assert.ok(!/(?:^|[;{])\s*content\s*:|\bdisplay\s*:\s*none|\bvisibility\s*:\s*hidden|text-transform\s*:|@import/.test(declarations),'Content-changing CSS: '+file);continue;
  }
  assert.ok(allowed[file],'Unexpected application source change: '+file);
  const original=git(['show',base+':'+file]);
  assert.deepEqual(ast(current,allowed[file],file),ast(original,allowed[file],file),'Text, handlers, API calls or calculations changed: '+file);executable++;
}
console.log('PASS preservation: '+files.length+' application files; '+executable+' executable files differ only in explicit presentation maps/classes/wrapper; no backend/catalog edits or changed content, handlers, controls or calculations.');
