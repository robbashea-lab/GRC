import scenario from '../../../shared/fixtures/approvedV3Scenario.json';

const clone = value=>JSON.parse(JSON.stringify(value));
const emptyTables = ['organizational_controls','exceptions','assessments','comments','notifications'];
const sourceClients = new Set(Object.values(scenario.source_client_ids));

export function freshApprovedDemo() {
  const db=clone({...scenario.records,...scenario.demo_context});
  for(const key of emptyTables)db[key]=[];
  db.approved_sample_version=scenario.source_sha256;
  const actor=db.users.find(user=>user.user_id===scenario.demo_actor_id);
  db.user={...actor,favorite_client_ids:[]};
  return db;
}

// Retained Demo sessions keep the client identities, enrollments, assignments and edits
// they already contain. Add the three previously unavailable sample organizations only.
export function addMissingApprovedClients(db) {
  if(db.approved_sample_version || !db.clients.some(c=>c.client_id==='demo_brawndo'))return false;
  const aliases={ppth:['Princeton-Plainsboro','Princeton-Plainsboro Teaching Hospital'],
    piedpiper:['Pied Piper'],cyberdyne:[]};
  const approved=freshApprovedDemo();
  const added=new Set(Object.entries(aliases).flatMap(([key,priorNames])=>{
    const client=approved.clients.find(c=>c.source_client_id===key);
    const names=[...priorNames,client.name].map(n=>n.toLowerCase());
    return db.clients.some(c=>c.client_id===client.client_id||c.client_id==='demo_'+key||
      names.includes((c.name||'').trim().toLowerCase()))?[]:[client.client_id];
  }));
  const userAliases=new Map();
  for(const person of approved.users) {
    const scoped=person.client_ids.filter(id=>added.has(id));
    if(!scoped.length)continue;
    const existing=db.users.find(u=>u.user_id===person.user_id||u.email&&person.email&&u.email.toLowerCase()===person.email.toLowerCase());
    if(existing)userAliases.set(person.user_id,existing);
    else db.users.push({...person,client_ids:scoped});
  }
  // Only source sample user IDs are rewritten. Existing editable records are never visited.
  const aliasRecord=(row,cid)=>JSON.parse(JSON.stringify(row),(_,v)=>{
    const existing=typeof v==='string'&&userAliases.get(v);
    if(!existing)return v;
    // Reusing a name/email never grants the retained account access to an added client.
    return existing.role==='super_admin'||existing.role==='platform_admin'&&existing.all_clients===true||
      existing.client_ids?.includes(cid)?existing.user_id:null;
  });
  for(const [table,rows] of Object.entries(scenario.records)) {
    if(table==='users')continue;
    const incoming=rows.filter(r=>added.has(r.client_id)).map(r=>aliasRecord(r,r.client_id));
    (db[table]||=[]).push(...incoming);
  }
  db.baselines||={};db.logs||=[];
  for(const cid of added)db.baselines[cid]=aliasRecord(approved.baselines[cid],cid);
  db.logs.push(...approved.logs.filter(log=>added.has(log.client_id)).map(r=>aliasRecord(r,r.client_id)));
  db.approved_sample_version=scenario.source_sha256;
  return true;
}

export const isApprovedOnlyStore=db=>db.clients.some(c=>sourceClients.has(c.client_id))&&!db.clients.some(c=>c.client_id==='demo_brawndo');
