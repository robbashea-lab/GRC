import { aggregateClientDashboard, DASHBOARD_KINDS } from "./clientDashboard";
import { dashboardPosture } from './dashboardPosture';
import { complianceProgress } from './complianceProgress';

export function labelDashboardRows(rows, members) {
  const names=new Map(members.map(user=>[user.user_id,user.name||user.email]));
  return rows.map(row=>row.items?{...row,items:labelDashboardRows(row.items,members)}:{...row,owner:names.get(row.owner_id)||row.owner});
}

// Every source request includes client_id; the existing backend _scope_filter
// rejects unauthorized tenants. Client-side validation is an additional guard.
export async function loadClientDashboard(api, { clientId, user, scope, signal, today, workQueue = false }) {
  if (!clientId) throw new Error("Select a client to view its dashboard.");
  const params = { client_id: clientId, scope: scope.kind };
  if (scope.kind === "user") params.user_id = scope.user_id;
  const [summary, memberResponse, baselineResponse] = await Promise.all([
    api.get("/dashboard", { params, signal }),
    api.get(`/clients/${encodeURIComponent(clientId)}/members`, { signal }),
    api.get('/onboarding/baseline', {params:{client_id:clientId},signal}),
  ]);
  if (summary.data.contract_version === 2) {
    if (summary.data.client_id !== clientId) throw new Error('Dashboard belongs to another client.');
    const members=memberResponse.data;
    const requirements=summary.data.applicable_requirements;
    const programs=complianceProgress(clientId,baselineResponse.data?.state,requirements);
    const frameworkSummary=programs.some(program=>program.trackingAvailable)
      ? (await api.get('/frameworks/summary',{params:{client_id:clientId},signal})).data : undefined;
    let queue, cisRows;
    if(workQueue) {
      const response=await api.get('/dashboard',{params:{...params,work_queue:true},signal});
      queue=response.data;
      if(queue.client_id!==clientId||!queue.groups)throw new Error('Work queue could not be loaded for this client.');
      if(programs.some(p=>p.key==='cis-ig1')) {
        const {data}=await api.get('/frameworks/cis-ig1',{params:{client_id:clientId},signal});
        if(data.assessments.some(a=>a.client_id!==clientId))throw new Error('Assessment belongs to another client.');
        const byId=new Map(data.assessments.map(a=>[a.definition_id,a]));
        // Linked-work projection lets the dashboard derive gap tracking, evidence and freshness.
        cisRows=data.definitions.filter(d=>byId.has(d.id)).map(d=>({...d,...byId.get(d.id),work:data.work?.[byId.get(d.id).framework_assessment_id]}));
      }
    }
    return {...summary.data,members,queue,cisRows,onboardingCompleted:!!baselineResponse.data?.state?.completed,
      posture:Object.fromEntries(Object.entries(summary.data.posture).map(([key,value])=>[key,Array.isArray(value)?labelDashboardRows(value,members):value])),
      programs:complianceProgress(clientId,baselineResponse.data?.state,requirements,frameworkSummary)};
  }
  if(workQueue)throw new Error('This dashboard requires the current work-queue contract.');
  const completeSnapshot=summary.data.management?.records;
  const sources=completeSnapshot?null:await Promise.all(DASHBOARD_KINDS.map(kind=>api.get(`/${kind}`,{params:{client_id:clientId},signal})));
  const records=completeSnapshot||Object.fromEntries(DASHBOARD_KINDS.map((kind,i)=>[kind,sources[i].data]));
  // Older servers remain compatible, but cannot silently claim a capped
  // register response is complete. New servers return one full authorized set.
  if (DASHBOARD_KINDS.some(kind => !Array.isArray(records[kind]) || !completeSnapshot && records[kind].length >= 1000)) {
    throw new Error("This client's record list could not be loaded in full. Please use the detailed modules while the dashboard is reviewed.");
  }
  const members = memberResponse.data;
  const configuredPrograms=complianceProgress(clientId,baselineResponse.data?.state,records.requirements);
  const frameworkSummary=configuredPrograms.some(p=>p.trackingAvailable)
    ? (await api.get('/frameworks/summary',{params:{client_id:clientId},signal})).data : undefined;
  today = today || (summary.data.management?.as_of ? new Date(summary.data.management.as_of+'T12:00:00Z') : new Date());
  const aggregation=aggregateClientDashboard(records, {clientId,user,scope,members,today});
  return { ...summary.data, members, ...aggregation, onboardingCompleted:!!baselineResponse.data?.state?.completed, posture:dashboardPosture(aggregation,{members,today}), programs:complianceProgress(clientId,baselineResponse.data?.state,records.requirements,frameworkSummary) };
}
