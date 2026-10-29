import {cisDemoArtifactDescriptor} from './cisDemoArtifactRecipes';
import {renderCisOperationArtifact} from './cisDemoOperations';
import {renderCisOperatingArtifact} from './cisDemoOperatingEvidence';
import {DEMO_INLINE_LIMIT} from '../lib/demoStorageErrors';

// Called only after the native preview download route authorizes its current
// session/role/client. This does not write records, caches, quotas or storage.
export function restoredCisDemoEvidence(db, evidence) {
  if (!evidence || evidence.content_base64 || evidence.demo_file_storage !== 'session_only') return null;
  const descriptor = cisDemoArtifactDescriptor(db, evidence);
  if (!descriptor) return null;
  const render = descriptor.recipe.kind === 'operation' ? renderCisOperationArtifact : renderCisOperatingArtifact;
  const result = render(descriptor.recipe);
  if (!result || typeof result.content_base64 !== 'string' || !Number.isInteger(result.size)
    || result.size !== descriptor.immutable.size || result.size < 1 || result.size > DEMO_INLINE_LIMIT
    || result.content_base64.length > 4 * Math.ceil(DEMO_INLINE_LIMIT / 3)) return null;
  try {
    if (atob(result.content_base64).length !== result.size) return null;
  } catch {
    return null;
  }
  // Keep all native metadata and legitimate edits; only return the missing bytes.
  return {...evidence, content_base64: result.content_base64};
}
