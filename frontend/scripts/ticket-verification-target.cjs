// Published verification uses an owner-authorized Sites dispatch credential on
// stdin only. A fresh browser context keeps all Demo changes in isolated storage.
const fs=require('node:fs'),path=require('node:path');
module.exports=async()=>{
  const published=process.argv.includes('--published');
  let token='',base='http://127.0.0.1:4387',out=path.resolve(__dirname,'../../docs');
  if(published){
    // Windows PTYs need raw input to suppress credential echo; Enter arrives as CR.
    if(process.stdin.isTTY)process.stdin.setRawMode(true);
    process.stdout.write('Ready for published verification JSON on stdin (input is hidden).\n');
    const input=await new Promise((resolve,reject)=>{let value='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{value+=chunk.replace(/\r/g,'\n');if(value.includes('\n')){process.stdin.pause();try{resolve(JSON.parse(value.trim()));}catch(e){reject(e);}}});});
    base=input.base;token=input.token;out=input.outputDirectory;
    if(base!=='https://iventure-grc-code-preview.mr-robbashea.chatgpt.site'||typeof token!=='string'||!token||!path.isAbsolute(out))throw new Error('Use the existing private Demo and an absolute evidence directory');
    fs.mkdirSync(out,{recursive:true});
  }
  return {base,out,route:async r=>{
    if(new URL(r.request().url()).origin!==base)return r.abort();
    if(!token)return r.continue();
    // Header overrides survive redirects in Playwright. Never follow one with
    // the private dispatch credential, even when routing checked the first URL.
    const response=await r.fetch({headers:{...r.request().headers(),'OAI-Sites-Authorization':'Bearer '+token},maxRedirects:0});
    if(response.status()>=300&&response.status()<400)return r.abort();
    return r.fulfill({response});
  }};
};
