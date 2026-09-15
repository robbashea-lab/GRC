import { complianceNavigation } from './complianceNavigation';

// Finalized program applicability is authoritative. The current Requirement
// model is a program register, not assessed framework controls. Neither evidence
// presence nor a selected framework establishes an addressed requirement.
// Future assessment integration belongs here, shared with reporting: it must
// define applicable denominator, exclude N/A, retain unassessed states, and
// reconcile open material findings/validation before calculating progress.
export function complianceProgress(clientId, baseline, requirements) {
  return complianceNavigation(clientId, baseline, requirements).map(program => ({
    ...program, progress: null, denominator: null, trackingAvailable: false,
    status: 'Program tracking configured',
    explanation: 'Detailed requirement progress will appear as requirement assessments are completed.',
  }));
}
