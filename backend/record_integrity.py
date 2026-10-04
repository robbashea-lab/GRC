"""Report explicit relationship invariants and safe legacy-field backfills.

No title inference, relationship reassignment, history edits or compatibility
deletions. Read models continue to resolve their existing authoritative owners.
"""
from collections import Counter
from datetime import datetime

from evidence_context import SOURCES, ALIASES
from record_contracts import WRITE_ALIASES

KEYS = {kind: spec['key'] for kind, spec in SOURCES.items()}
KEYS['assessments'] = 'assessment_id'
SOURCE_KINDS = {'review': 'reviews', 'finding': 'findings', 'risk': 'risks', 'vendor': 'vendors',
                'policy': 'policies', 'audit': 'assessments'}
BACKFILLS = {**WRITE_ALIASES, 'tasks': {'owner_id': 'assignee_id'}}


def references(kind, row):
    invalid = []

    def container(value, expected, field, optional=True):
        if value is None and optional:
            return expected()
        if not isinstance(value, expected):
            invalid.append(field)
            return expected()
        return value

    def objects(value, field):
        for index, item in enumerate(container(value, list, field)):
            path = f'{field}.{index}'
            yield path, container(item, dict, path, optional=False)

    def audit_links(value, field):
        state = container(value, dict, field)
        if state.get('report_evidence_id'):
            yield field + '.report_evidence_id', 'evidence', state['report_evidence_id'], None
        for name, item in container(state.get('items'), dict, field + '.items').items():
            path = f'{field}.items.{name}'
            item = container(item, dict, path, optional=False)
            for ident in container(item.get('evidence_ids'), list, path + '.evidence_ids'):
                yield path + '.evidence_ids', 'evidence', ident, None

    for target, key in KEYS.items():
        if target != kind and row.get(key):
            yield key, target, row[key], row.get('occurrence_id') if target == 'reviews' else None
    for field in ('related_links', 'relationships'):
        for path, link in objects(row.get(field), field):
            yield path, link.get('kind'), link.get('id'), link.get('occurrence_id')
    if kind == 'evidence' and row.get('linked_id'):
        linked_type = row.get('linked_type')
        yield 'linked_id', ALIASES.get(linked_type) if isinstance(linked_type, str) else None, row['linked_id'], row.get('occurrence_id')
    for field, target in (('related_risk_ids', 'risks'), ('related_task_ids', 'tasks'),
                          ('contract_evidence_ids', 'evidence'), ('evidence_ids', 'evidence')):
        for index, ident in enumerate(container(row.get(field), list, field)):
            yield f'{field}.{index}', target, ident, None
    if kind == 'vendors':
        for path, artifact in objects(row.get('assurance_records'), 'assurance_records'):
            for ident in container(artifact.get('evidence_ids'), list, path + '.evidence_ids'):
                yield path + '.evidence_ids', 'evidence', ident, None
    if kind == 'policies':
        approval_subject = container(row.get('approval_subject'), dict, 'approval_subject')
        for field, value in (('approval_source', row.get('approval_source')),
                             ('approval_subject.basis', approval_subject.get('basis'))):
            subject = container(value, dict, field)
            if subject.get('evidence_id'):
                yield field + '.evidence_id', 'evidence', subject['evidence_id'], None
        for path, decision in objects(row.get('approval_history'), 'approval_history'):
            subject = container(decision.get('subject'), dict, path + '.subject')
            basis = container(subject.get('basis'), dict, path + '.subject.basis')
            ident = basis.get('evidence_id')
            if ident:
                yield path + '.subject.basis.evidence_id', 'evidence', ident, None
    if kind == 'reviews':
        yield from audit_links(row.get('iso_audit'), 'iso_audit')
        for path, occurrence in objects(row.get('occurrences'), 'occurrences'):
            for evidence_path, evidence in objects(occurrence.get('evidence'), path + '.evidence'):
                yield evidence_path, 'evidence', evidence.get('evidence_id'), None
            yield from audit_links(occurrence.get('iso_audit'), path + '.iso_audit')
    if kind == 'organizational_controls':
        versions = list(objects(row.get('history'), 'history'))
        for path, observation in objects(row.get('observations'), 'observations'):
            versions.append((path + '.design_snapshot', container(observation.get('design_snapshot'), dict, path + '.design_snapshot')))
        for path, version in versions:
            for link_path, link in objects(version.get('related_links'), path + '.related_links'):
                yield link_path, link.get('kind'), link.get('id'), link.get('occurrence_id')
    for field in invalid:
        yield field, None, None, None


async def inspect_client(db, client_id):
    keys = {**KEYS, 'evidence': 'evidence_id'}
    records = {kind: await db[kind].find({'client_id': client_id}, {'_id': 0, 'content_base64': 0}).to_list(None)
               for kind in keys}
    counts = {kind: Counter(row.get(key) for row in records[kind] if isinstance(row.get(key), str)) for kind, key in keys.items()}
    lookup = {kind: {row[key]: row for row in records[kind] if isinstance(row.get(key), str)} for kind, key in keys.items()}
    issues, repairs = [], []
    for kind, rows in records.items():
        duplicates = set()
        for row in rows:
            context = {'kind': kind, 'id': row.get(keys[kind])}
            if not isinstance(context['id'], str) or not context['id']:
                issues.append({**context, 'code': 'missing_identity'})
                continue
            if counts[kind][context['id']] > 1:
                if context['id'] not in duplicates:
                    issues.append({**context, 'code': 'duplicate_identity'})
                    duplicates.add(context['id'])
                continue
            changes = {}
            for alias, canonical in BACKFILLS.get(kind, {}).items():
                old, current = row.get(alias), row.get(canonical)
                if old not in (None, '') and current in (None, ''):
                    if isinstance(old, str):
                        changes[canonical] = old
                    else:
                        issues.append({**context, 'field': alias, 'code': 'invalid_legacy_value'})
                elif old not in (None, '') and current not in (None, '') and current != old:
                    issues.append({**context, 'field': canonical, 'code': 'conflicting_legacy_alias'})
            if changes:
                if row.get('updated_at'):
                    try:
                        if not isinstance(row['updated_at'], str):
                            raise ValueError('Edit version must be a string')
                        datetime.fromisoformat(row['updated_at'].replace('Z', '+00:00'))
                    except ValueError:
                        issues.append({**context, 'field': 'updated_at', 'code': 'invalid_edit_version'})
                        changes = {}
            if changes:
                fields = [*changes, 'updated_at', '_contract_migration']
                repairs.append({**context, 'id_field': keys[kind], 'changes': changes,
                                'before': {field: row[field] for field in fields if field in row},
                                'absent': [field for field in fields if field not in row]})
            for field, target, ident, occurrence in references(kind, row):
                reference = {**context, 'field': field, 'target_kind': target, 'target_id': ident}
                if not isinstance(target, str) or target not in lookup or not isinstance(ident, str) or not ident:
                    issues.append({**reference, 'code': 'invalid_relationship'})
                    continue
                found = lookup[target].get(ident)
                if not found:
                    foreign = await db[target].find_one({keys[target]: ident}, {'client_id': 1})
                    issues.append({**reference, 'code': 'cross_tenant_relationship' if foreign and foreign.get('client_id') != client_id else 'missing_relationship_target'})
                elif counts[target][ident] > 1:
                    issues.append({**reference, 'code': 'ambiguous_relationship_target'})
                elif target == 'reviews' and occurrence and occurrence not in [
                        found.get('current_occurrence_id') or 'occ_' + ident,
                        *[item.get('occurrence_id') for item in (found.get('occurrences') if isinstance(found.get('occurrences'), list) else []) if isinstance(item, dict)]]:
                    issues.append({**reference, 'code': 'unknown_review_occurrence'})
            if isinstance(row.get('source_type'), str) and row['source_type'] in SOURCE_KINDS and row.get('source_id'):
                target = SOURCE_KINDS[row['source_type']]
                if row.get(keys[target]) != row['source_id']:
                    issues.append({**context, 'field': 'source_id', 'code': 'conflicting_source_relationship'})
    return {'client_id': client_id, 'records': {kind: len(rows) for kind, rows in records.items()},
            'issues': issues, 'repairs': repairs, 'remediation_tickets': ticket_diagnostics(records)}


def ticket_diagnostics(records):
    """Report compatibility cases; never propose merging or choosing an Action."""
    findings={f.get('finding_id'):f for f in records.get('findings',[])}
    grouped={fid:[] for fid in findings}
    output=[]
    for task in records.get('tasks',[]):
        fid=task.get('finding_id')
        if fid in grouped:grouped[fid].append(task)
        elif fid:output.append({'ticket_id':'task:'+task['task_id'],'code':'linked_finding_unavailable','finding_id':fid})
    for fid,finding in findings.items():
        if not isinstance(fid,str):continue
        tasks=grouped[fid];ids=[t.get('task_id') for t in tasks]
        primary=finding.get('primary_task_id')
        code=('primary_action_unavailable' if primary and primary not in ids else
              'no_action' if not tasks else 'ambiguous_primary_action' if len(tasks)>1 and not primary else
              'explicit_primary' if primary else 'single_action_compatibility')
        output.append({'ticket_id':'finding:'+fid,'code':code,'primary_task_id':primary or (ids[0] if len(ids)==1 else None),
            'actions':[{'task_id':t.get('task_id'),'owner_id':t.get('assignee_id',t.get('owner_id')),
                        'due_date':t.get('due_date'),'status':t.get('status')} for t in tasks],
            'outstanding_actions':sum(t.get('status') not in ('done','cancelled') for t in tasks)})
    return output
