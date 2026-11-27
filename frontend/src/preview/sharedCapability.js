import {sharedProgramProjection} from './clientRelationships';
import {cisProgramProjection} from './cisCapability';
import {sharedClientPrograms} from '../lib/sharedExperience';

// Native enrollment selects the approved shared workflow; callers still authorize every command.
export function isSharedClient(db, clientId) {
  const client=db.clients?.find(row=>row.client_id===clientId);
  return !!client && ['active','onboarding'].includes(client.status) && !client.archived && !client.archived_at
    && sharedClientPrograms({...client,cis_program:cisProgramProjection(db,client),shared_programs:sharedProgramProjection(db,client)}).length>0;
}
