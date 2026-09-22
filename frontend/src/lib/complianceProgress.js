import { complianceNavigation } from './complianceNavigation';

// Applicability, assessment state and remediation are separate facts. No scoring
// methodology is assumed: N/A remains a count, never an inferred completion.
export function complianceProgress(clientId, baseline, requirements, summary) {
  if(summary && summary.client_id!==clientId)throw new Error('Framework summary belongs to another client.');
  return complianceNavigation(clientId, baseline, requirements).map(program => {
    const recorded=summary?.items.find(item=>item.key===program.key);
    const trackingAvailable=!!program.implemented;
    return {...program,progress:null,denominator:null,trackingAvailable,assessment:trackingAvailable?recorded||null:null,
      status:trackingAvailable?'Assessment tracking available':'Configured — detailed assessment not yet available',
      explanation:!trackingAvailable?'Program workspace only. Detailed assessment and mapping are not yet implemented.'
        :!recorded?'Assessment summary is unavailable. Open the framework workspace for current records.'
        :!recorded.total?'No assessment records configured. Review the program configuration.'
        :recorded.status_counts.not_assessed===recorded.total?'No assessments started. Recorded requirement states are shown below.'
        :'Current recorded assessment states—not a compliance or certification conclusion.'};
  });
}
