import {prepareCanonicalCisOnboarding} from './cisCanonicalScope';
import {CIS_DEMO_REVISION} from './cisDemoSelection';

// A fresh, private preview build may prepare one canonical identity for actual
// native onboarding. Ordinary reads never call this or overwrite visitor work.
export function prepareCisOnboardingFixture(db, clientId) {
  const result = prepareCanonicalCisOnboarding(db, clientId, {purpose:'onboarding_qa'});
  db.cis_demo_rollout ||= {revision:CIS_DEMO_REVISION, clients:{}, reconciliation_required:[]};
  db.cis_demo_rollout.clients ||= {};
  // Keep the retired bootstrap from interpreting this deliberately blank client
  // as an untouched legacy cohort and repopulating it during the next read.
  db.cis_demo_rollout.clients[clientId] = {
    revision:CIS_DEMO_REVISION, ownership:'fresh_fixture', onboarding_prepared:true
  };
  return result;
}
