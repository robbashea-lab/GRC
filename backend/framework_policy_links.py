"""Current policy support uses stable IDs; an explicit list supersedes inherited links."""
from framework_catalog import CATALOGS


def supports(assessment, policy):
    if assessment.get('client_id') and policy.get('client_id') and assessment['client_id'] != policy['client_id']:
        return False
    if 'policy_link_ids' in assessment:
        return isinstance(assessment['policy_link_ids'], list) and policy.get('policy_id') in assessment['policy_link_ids']
    return (any(link.get('kind') == 'policies' and link.get('id') == policy.get('policy_id') for link in assessment.get('related_links', []))
            or policy.get('framework_assessment_id') == assessment.get('framework_assessment_id') and bool(assessment.get('framework_assessment_id'))
            or any(mapping['policy_key'] == policy.get('baseline_key') and assessment.get('definition_id') in mapping['safeguards']
                   for mapping in CATALOGS.get(assessment.get('framework_key'), {}).get('policy_mappings', [])))
