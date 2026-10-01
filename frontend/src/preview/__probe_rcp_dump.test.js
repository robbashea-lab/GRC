import axios from 'axios';import {previewAdapter} from './adapter';
const api=axios.create({adapter:previewAdapter});const cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
test('dump',async()=>{
 const rv=(await api.get('/reviews',{params:{client_id:cid}})).data;
 const r=rv[0];console.log(JSON.stringify({...r,occurrences:undefined}));console.log(JSON.stringify(r.occurrences[0]).slice(0,1500));
 const cal=(await api.get('/calendar',{params:{client_id:cid,start:'2026-09-01',end:'2027-08-31'}})).data;console.log('CAL',JSON.stringify(Object.keys(cal)),JSON.stringify(cal).slice(0,1500));
 const d=(await api.get('/dashboard',{params:{client_id:cid}})).data;console.log('DASH',JSON.stringify(d).slice(0,3000));
});
