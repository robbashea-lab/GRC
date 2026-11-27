"""Resolve explicit assessment assignments before falling back to a shared Review."""


def finding_scopes(assessments):
    scopes = {}
    for row in assessments:
        for link in row.get('related_links') or []:
            if link.get('kind') == 'findings' and link.get('id'):
                scopes.setdefault(link['id'], set()).add(row['framework_assessment_id'])
    return scopes


def finding_applies_to(assessment_id, finding, review_ids, scopes):
    assigned = finding.get('framework_assessment_id')
    linked = scopes.get(finding['finding_id'], ())
    if assigned or linked:
        return assigned == assessment_id or assessment_id in linked
    return finding.get('review_id') in review_ids


def action_applies_to(assessment_id, task, review_ids, finding_ids):
    if task.get('framework_assessment_id') == assessment_id:
        return True
    if task.get('finding_id'):
        return task['finding_id'] in finding_ids
    return not task.get('framework_assessment_id') and task.get('review_id') in review_ids
