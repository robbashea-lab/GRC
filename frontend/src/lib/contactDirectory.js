import {contactAccess} from './contactAccess';

// Existing inactive contacts are archived in the directory; no stored data migration.
export const isArchivedContact = contact => ['inactive','archived'].includes(contact.status);
export function directoryAccess(contact, clientId, context) {
  const state=contactAccess(contact,clientId,context);
  const labels={'Account not linked':['none','No access'],'No client access':['none','No access'],'Invitation pending':['pending','Invitation pending'],'Active account':['active','Active account'],'Disabled account':['disabled','Disabled']};
  const [key,label]=labels[state.label]||['unknown',state.label];
  return {...state,key,label};
}
export function directoryRows(rows,{query='',access='',archived=false,clientId,context}) {
  const search=query.trim().toLowerCase();
  return rows.filter(r=>r.client_id===clientId&&(archived||!isArchivedContact(r))&&
    (!search||['name','title','email','phone'].some(k=>String(r[k]||'').toLowerCase().includes(search)))&&
    (!access||directoryAccess(r,clientId,context).key===access));
}
export const CONTACT_FIELDS=[['name','Full Name','text',true],['title','Job Title','text',false],['email','Email','email',true],['phone','Phone','tel',false]];
export const contactForm = record => Object.fromEntries([...CONTACT_FIELDS.map(([key])=>[key,record?.[key]||'']),['notes',record?.notes||'']]);
