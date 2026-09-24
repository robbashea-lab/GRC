// Presentation contract only; backend authorization is authoritative.
// Export names retained for existing consumers.
export const ROLE_MODEL_STATUS = 'server-enforced';
export const PLANNED_ROLES = [
  {key:'platform_owner',legacyKey:'super_admin',label:'Platform Owner',scope:'PLATFORM-WIDE',detail:'Trusted platform administrator. All client access, subject to workflow and historical integrity rules.'},
  {key:'platform_administrator',legacyKey:'platform_admin',label:'Service Provider GRC Administrator',scope:'ASSIGNED CLIENTS',detail:'Administers explicitly assigned client programs and client users. No global access or internal-role delegation.'},
  {key:'client_grc_manager',legacyKey:'client_grc_manager',label:'Client GRC Manager',scope:'THEIR CLIENT',detail:'Coordinates operational work and existing client users. Cannot change programs, delete authoritative records, or manage access.'},
  {key:'client_contributor',legacyKey:'client_contributor',label:'Client Contributor',scope:'THEIR CLIENT',detail:'Works assigned activities, uploads evidence and contributes comments. Cannot administer or approve governance decisions.'},
  {key:'client_read_only',legacyKey:'client_readonly',label:'Client Read Only',scope:'THEIR CLIENT',detail:'Reads authorized client content. No business-record mutations or governance approvals.'},
];
const row=(label,capabilities,values)=>({label,capabilities,roles:Object.fromEntries(PLANNED_ROLES.map((role,i)=>[role.key,values[i]]))});
export const PLANNED_CAPABILITIES=[
  row('View authorized client records',['view'],['Yes','Assigned Clients','Their Client','Their Client','Their Client']),
  row('Create/edit operational records',['create','edit'],['Yes','Assigned Clients','Permitted Records','Permitted Records','No']),
  row('Upload evidence/comment',['upload_evidence','comment'],['Yes','Assigned Clients','Their Client','Their Client','No']),
  row('Assign work',['assign'],['Yes','Assigned Clients','Limited','Limited','No']),
  row('Complete assigned activities',['complete'],['Yes','Assigned Clients','Permitted Records','Permitted Records','No']),
  row('Configure profile, onboarding and frameworks',['configure'],['Yes','Assigned Clients','No','No','No']),
  row('Create client tenants',['create_clients'],['Yes','No','No','No','No']),
  row('Manage client users',['manage_client_users'],['Yes','Assigned Clients','No','No','No']),
  row('Manage internal accounts',['manage_platform_users'],['Yes','No','No','No','No']),
  row('Delete operational records',['delete'],['Yes','Assigned Clients','No','No','No']),
  row('Governance decisions',['approve','accept_risk','validate_finding'],['Yes','Assigned Clients','No','No','No']),
  row('Platform audit access',['view_audit_log'],['Yes','No','No','No','No']),
];
export const FUTURE_CLIENT_APPROVER={key:'client_approver',label:'Client Approver',status:'future',assignable:false,
  detail:'A separately authorized client approval role is not active. A business approver designation does not override read-only permissions.'};
