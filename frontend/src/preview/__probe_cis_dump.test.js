import axios from 'axios';import {previewAdapter} from './adapter';
const fs=require('fs');const OUT='/tmp/claude-0/-home-user-GRC/2b41b706-c012-595e-94ac-48287f0e255c/scratchpad/';
const api=axios.create({adapter:previewAdapter});const cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const g=async(p,params={})=>(await api.get(p,{params:{client_id:cid,...params}})).data;
test('dump',async()=>{
  const out={};
  for(const k of ['/frameworks/cis-ig1','/reviews','/findings','/tasks','/evidence','/dashboard','/risks','/policies'])try{out[k]=await g(k)}catch(e){out[k]={err:String(e.message)}}
  try{out.assignees=await g('/clients/'+cid+'/assignees')}catch(e){out.assignees={err:e.message}}
  try{out.cal=await g('/calendar',{start:'2024-01-01',end:'2028-12-31',scope:'all'})}catch(e){out.cal={err:e.message}}
  fs.writeFileSync(OUT+'dump.json',JSON.stringify(out));
});
