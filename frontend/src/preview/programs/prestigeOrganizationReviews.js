import {write} from '../store';
import {frameworkRequest} from '../frameworks';
import {reviewSchedule} from '../../lib/reviewOccurrences';

const CID = 'demo_prestige';
const copy = value => JSON.parse(JSON.stringify(value));
const COMMITMENT = ['CC2.3', 'CC3.1', 'CC3.4', 'CC6.7', 'CC9.2', 'A1.1', 'C1.1', 'C1.2'];

// These are management-selected activities, separate from the eight native SOC baseline schedules.
export function createPrestigeOrganizationReviews(candidate, {purpose} = {}) {
  if (purpose !== 'organization_review_source_qa' || candidate?.clientId !== CID
    || candidate.manifest?.client_id !== CID || candidate.organizationReviewManifest)
    throw new Error('Use one current Prestige source transaction before adding organization Reviews.');
  const result = copy(candidate), db = result.db;
  const facts = [
    {key: 'next-program-review', title: 'Annual internal program implementation review', type: 'management',
      category: 'management', due: '2027-10-22', definitions: Object.keys(candidate.manifest.assessment_ids),
      notes: 'Dale reconciles all selected Security, Availability and Confidentiality criteria with current implementation, owners and operating workpapers. This is separate from the risk/system-scope Review on the same date.'},
    {key: 'next-customer-commitment-review', title: 'Customer confidentiality and service-commitment review', type: 'data',
      category: 'customer', due: '2027-02-19', definitions: COMMITMENT,
      notes: 'Nancy Huff is the business lead; Brennan supplies technical input and Dale records the Review. Reconcile customer rights, confidentiality, retention and service commitments. This does not create a platform account for a Contact.'},
  ];
  if (facts[0].definitions.length !== 38) throw new Error('Preserve the complete 38-criterion SOC scope.');
  const reviewIds = {};
  for (const fact of facts) {
    const ids = fact.definitions.map(key => {
      const id = candidate.manifest.assessment_ids[key];
      if (db.framework_assessments.filter(row => row.client_id === CID && row.framework_assessment_id === id
        && row.definition_id === key && row.framework_key === 'soc-2').length !== 1)
        throw new Error('Resolve the exact native criterion before linking the organization Review.');
      return id;
    });
    if (db.reviews.some(row => row.client_id === CID && row.title === fact.title))
      throw new Error('Preserve an existing organization Review instead of creating a duplicate.');
    const review = write(db, 'reviews', {client_id: CID, title: fact.title, review_type: fact.type,
      owner_id: 'demo_prestige_user_0', recurrence: 'annual', custom_recurrence_days: null,
      due_date: fact.due, status: 'upcoming', scope: fact.definitions.join(', '), notes: fact.notes,
      governance_context: {category: fact.category, cadence_source: 'organization_defined',
        rationale: 'Fictional organization-selected governance activity, not a universal SOC 2 cadence.',
        cadence_rationale: 'Management selected annual maintenance and reassessment after material changes.'}});
    Object.assign(review, reviewSchedule(review, true));
    for (const id of ids) frameworkRequest(db, '/framework_assessments/' + id + '/reviews', 'post', {}, {review_id: review.review_id});
    reviewIds[fact.key] = review.review_id;
  }
  result.organizationReviewManifest = {client_id: CID, review_ids: reviewIds, linked_criteria: 46};
  return result;
}
