import api from './api';
import {useCreateIntent} from './createIntent';

const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const identityPart = value => typeof value === 'string' && !!value.trim();
const version = value => value === null || typeof value === 'string';

export const frameworkContextScope = ({mode, actorId, clientId, frameworkKey, assessmentId}) =>
  JSON.stringify([mode, actorId, 'r4-assessment-context', clientId, frameworkKey, assessmentId]);

export const frameworkContextIdentity = identity => ['standard', 'demo'].includes(identity.mode)
  && [identity.actorId, identity.clientId, identity.frameworkKey, identity.assessmentId].every(identityPart);

export function frameworkContextRequest(request, identity) {
  if (!frameworkContextIdentity(identity) || !Array.isArray(request) || request.length !== 2) return false;
  const [path, body] = request;
  return path === '/framework_assessments/' + identity.assessmentId && object(body)
    && Object.hasOwn(body, 'expected_last_assessed') && version(body.expected_last_assessed)
    && object(body.coordination) && Object.hasOwn(body.coordination, 'expected_client_updated_at')
    && version(body.coordination.expected_client_updated_at)
    && ['activity_id', 'review_id'].every(key => !Object.hasOwn(body.coordination, key)
      || body.coordination[key] === null || identityPart(body.coordination[key]))
    && [['client_id', identity.clientId], ['framework_key', identity.frameworkKey],
      ['framework_assessment_id', identity.assessmentId]].every(([key, value]) => !Object.hasOwn(body, key) || body[key] === value);
}

export function frameworkContextResponse(data, identity) {
  return object(data) && data.client_id === identity.clientId && data.framework_key === identity.frameworkKey
    && data.framework_assessment_id === identity.assessmentId;
}

// Only coordinated final PATCH uses this store; ordinary native saves stay independent.
export function useFrameworkContextIntent(identity,transport=api) {
  const post=async (path, body, options) => {
    if (!frameworkContextRequest([path, body], identity)) throw new Error('The retained assessment save does not match this workspace.');
    const response = await transport.patch(path, body, options);
    // Check before createIntent acknowledges and removes the retained command.
    if (!frameworkContextResponse(response.data, identity)) throw new Error('The assessment save response could not be verified. Its original request remains available for retry.');
    return response;
  };
  if(transport!==api)post.assertCommandCurrent=()=>transport.assertAssessmentCurrent();
  return useCreateIntent(post,frameworkContextScope(identity),frameworkContextIdentity(identity),transport!==api);
}
