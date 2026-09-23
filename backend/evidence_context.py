"""Read-only Evidence context. Batch lookups, bounded pages, no copied ownership."""
import json
from pathlib import Path
from datetime import date, timedelta
import review_occurrences
from framework_catalog import assessment_title

SOURCES = json.loads((Path(__file__).parents[1] / 'frontend/src/lib/evidenceSources.json').read_text())
ALIASES = {alias: kind for kind, spec in SOURCES.items() for alias in spec['aliases']}
DATES = ('created_at','evidence_date','effective_date')
FILTERS = ('mime_type', 'uploaded_by_email', 'linked_type', *DATES, 'program_areas', 'evidence_type', 'years', 'frameworks', 'refresh_status')
SORTS = ('filename', *FILTERS)
BATCH = 100
AREAS = {'reviews':'Reviews', 'policies':'Policies', 'vendors':'Vendors', 'risks':'Risks', 'findings':'Findings', 'framework_assessments':'Frameworks', 'requirements':'Frameworks'}


def direct_links(row):
    links = []
    kind = ALIASES.get(row.get('linked_type'))
    if kind and row.get('linked_id'):
        links.append({'kind':kind, 'id':row['linked_id'], 'occurrence_id':row.get('occurrence_id') if kind == 'reviews' else None, 'origin':'upload'})
    links.extend({**r, 'origin':'supporting'} for r in row.get('relationships', []) if r.get('kind') in SOURCES)
    return links


def review_evidence_query(review, oid):
    return {'$or': [
        {'linked_type': {'$in':['review','reviews']}, 'linked_id':review['review_id'], **review_occurrences.occurrence_query(review, oid)},
        {'relationships': {'$elemMatch': {'kind':'reviews', 'id':review['review_id'], 'occurrence_id':oid}}},
    ]}


def reference(kind, row, ident=None, occurrence=None):
    spec = SOURCES[kind]
    result = {'kind': kind, 'id': ident or (row or {}).get(spec['key']), 'label': spec['label'],
              'available': bool(row), 'title': (row or {}).get('title') or (row or {}).get('name') or 'Source unavailable'}
    if row:
        result['status'] = row.get('status')
        result['display_id'] = row.get('display_id')
        if kind=='framework_assessments':result['title']=assessment_title(row)
        result['archived'] = bool(row.get('archived_at') or row.get('status') == 'archived')
    if row and kind == 'reviews':
        oid = occurrence or 'occ_' + row['review_id']
        old = next((o for o in row.get('occurrences', []) if o.get('occurrence_id') == oid), None)
        current = oid == review_occurrences.occurrence_id(row)
        result.update(occurrence_id=oid, period=(old or {}).get('period') or
                      (review_occurrences.schedule(old or row)['period'] if old or current else 'Occurrence not recorded'),
                      available=bool(old or current))
    return result


async def enrich(db, rows, cid, can_access):
    """At most three lookup rounds per collection/batch, never a request per file."""
    catalog = {kind: {} for kind in SOURCES}
    queried = {kind: set() for kind in SOURCES}
    needed = {kind: set() for kind in SOURCES}
    for row in rows:
        for link in direct_links(row): needed[link['kind']].add(link['id'])
    # Existing module-owned relationships stay authoritative; batch reverse lookups.
    eids = [row['evidence_id'] for row in rows]
    external = {eid: [] for eid in eids}
    queries = {
        'vendors': {'$or':[{'contract_evidence_ids':{'$in':eids}}, {'assurance_records.evidence_ids':{'$in':eids}}]},
        'policies': {'$or':[{'approval_source.evidence_id':{'$in':eids}}, {'approval_subject.basis.evidence_id':{'$in':eids}}, {'approval_history.subject.basis.evidence_id':{'$in':eids}}]},
        'framework_assessments': {'related_links':{'$elemMatch':{'kind':'evidence','id':{'$in':eids}}}},
    }
    for kind, query in queries.items():
        async for doc in db[kind].find({'client_id':cid, **query}, {'_id':0}):
            ident = doc[SOURCES[kind]['key']]
            catalog[kind][ident] = doc
            if kind == 'vendors': ids = set(doc.get('contract_evidence_ids', [])) | {x for a in doc.get('assurance_records', []) for x in a.get('evidence_ids', [])}
            elif kind == 'policies': ids = {doc.get('approval_source', {}).get('evidence_id') if doc.get('approval_source') else None, (doc.get('approval_subject') or {}).get('basis', {}).get('evidence_id')} | {(h.get('subject') or {}).get('basis', {}).get('evidence_id') for h in doc.get('approval_history', [])}
            else: ids = {r['id'] for r in doc.get('related_links', []) if r['kind'] == 'evidence'} - set(doc.get('unlinked_evidence_ids', []))
            for eid in ids.intersection(external): external[eid].append({'kind':kind,'id':ident,'origin':'module'})
    for _ in range(3):
        for kind, keys in needed.items():
            missing = keys - queried[kind]
            if missing:
                queried[kind].update(missing)
                docs = await db[kind].find({'client_id': cid, SOURCES[kind]['key']: {'$in': list(missing)}}, {'_id': 0}).to_list(len(missing))
                catalog[kind].update({doc[SOURCES[kind]['key']]: doc for doc in docs})
        for kind in ('tasks', 'findings'):
            for row in catalog[kind].values():
                if row.get('finding_id') and kind == 'tasks': needed['findings'].add(row['finding_id'])
                if row.get('review_id'): needed['reviews'].add(row['review_id'])
        for review in catalog['reviews'].values():
            for item in [review, *review.get('occurrences', [])]:
                for related_kind, field in [('vendors','vendor_id'),('policies','policy_id'),('risks','risk_id')]:
                    if item.get(field): needed[related_kind].add(item[field])
    user_ids = list({row.get('uploaded_by') for row in rows if row.get('uploaded_by')})
    people = await db.users.find({'user_id': {'$in': user_ids}}, {'_id': 0, 'password_hash': 0}).to_list(len(user_ids)) if user_ids else []
    people = {u['user_id']: u for u in people if can_access(u, cid)}
    result = []
    for evidence in rows:
        kind = ALIASES.get(evidence.get('linked_type'))
        source = catalog.get(kind, {}).get(evidence.get('linked_id')) or {}
        finding = source if kind == 'findings' else catalog['findings'].get(source.get('finding_id'), {})
        review = source if kind == 'reviews' else catalog['reviews'].get(source.get('review_id') or finding.get('review_id'), {})
        oid = evidence.get('occurrence_id') if kind == 'reviews' else source.get('occurrence_id') or finding.get('occurrence_id')
        if review: oid = oid or 'occ_' + review['review_id']
        context = {'source': reference(kind, source, evidence.get('linked_id'), oid) if kind else None,
                   'finding': reference('findings', finding) if finding else None,
                   'review': reference('reviews', review, occurrence=oid) if review else None}
        person = people.get(evidence.get('uploaded_by'), {})
        email = evidence.get('uploaded_by_email') or person.get('email') or ''
        row = {**evidence, 'context': context, 'uploaded_by_email': email,
               'uploader': person.get('name') or email or 'Unknown uploader'}
        links = []
        for link in direct_links(evidence) + external[evidence['evidence_id']]:
            parent = catalog[link['kind']].get(link['id'])
            ref = reference(link['kind'], parent, link['id'], link.get('occurrence_id'))
            ref['origin'] = link['origin']
            if parent and link['kind']=='policies':
                ref['document_context'] = 'Current approval document' if (parent.get('approval_source') or {}).get('evidence_id')==evidence['evidence_id'] else 'Previous approval document' if any((h.get('subject') or {}).get('basis',{}).get('evidence_id')==evidence['evidence_id'] for h in parent.get('approval_history',[])) else 'Supporting document'
            if parent and link['kind'] == 'framework_assessments': ref['framework_key'] = parent.get('framework_key')
            ref['module_owned'] = any(r['kind']==ref['kind'] and r['id']==ref['id'] for r in external[evidence['evidence_id']])
            links.append(ref)
            if parent and link['kind'] == 'reviews':
                occurrence = next((o for o in parent.get('occurrences', []) if o.get('occurrence_id') == ref.get('occurrence_id')), parent)
                ref['year'] = str(occurrence.get('due_date') or '')[:4]
                if occurrence.get('framework_key'): ref['framework_key']=occurrence['framework_key']
                # Exact structured operational relationships, not title inference.
                for related_kind, field in [('vendors','vendor_id'),('policies','policy_id'),('risks','risk_id')]:
                    related = catalog[related_kind].get(occurrence.get(field))
                    if related: links.append({**reference(related_kind,related), 'origin':'review_context'})
        priority={'upload':0,'module':1,'supporting':2,'review_context':3}
        unique={}
        for ref in sorted(links,key=lambda r:priority[r['origin']]): unique.setdefault((ref['kind'],ref['id'],ref.get('occurrence_id')),ref)
        links=list(unique.values())
        row['references'] = links
        row['program_areas'] = sorted({AREAS.get(r['kind'], 'Other') for r in links if r['available']}) or ['Unassigned']
        row['years'] = sorted({r['year'] for r in links if r.get('year') and r['available']})
        if not any(r['kind']=='reviews' for r in links):
            recorded = evidence.get('evidence_date') or evidence.get('effective_date') or evidence.get('created_at')
            row['years'] = [str(recorded)[:4]] if recorded else []
        row['frameworks'] = sorted({r['framework_key'] for r in links if r.get('framework_key') and r['available']})
        row['evidence_type'] = evidence.get('evidence_type') or 'Other'
        row['display_name'] = evidence.get('display_name') or evidence.get('filename')
        # Private matching metadata is discarded before returning rows.
        row['_source'] = source
        row['_review'] = review
        result.append(row)
    return result


def category(row, root_kind, root, oid):
    source, ctx = row['_source'], row['context']
    kind = ALIASES.get(row.get('linked_type'))
    ident = root.get(SOURCES[root_kind]['key'])
    if any(r['available'] and r['kind'] == root_kind and r['id'] == ident and (root_kind != 'reviews' or r.get('occurrence_id') == oid) for r in row.get('references', [])):
        return 'direct'
    if kind == root_kind and row.get('linked_id') == ident:
        if kind != 'reviews' or (ctx['review'] or {}).get('occurrence_id') == oid: return 'direct'
    if not source: return None
    if root_kind == 'findings':
        if kind == 'tasks' and source.get('finding_id') == ident: return 'actions'
        if kind == 'reviews' and source.get('review_id') == root.get('review_id') and (ctx['review'] or {}).get('occurrence_id') == (root.get('occurrence_id') or 'occ_' + root.get('review_id', '')): return 'review'
    if root_kind == 'reviews' and kind in ('tasks', 'findings'):
        ref = ctx['review'] or {}
        if ref.get('id') == ident and ref.get('occurrence_id') == oid: return 'actions' if kind == 'tasks' else 'findings'
    if root_kind == 'risks' and kind == 'tasks' and (source.get('risk_id') == ident or source.get('task_id') in root.get('related_task_ids', [])): return 'treatment'
    if root_kind == 'vendors' and kind == 'reviews' and source.get('vendor_id') == ident: return 'review'
    return None


def date_match(value, selected, today):
    try: day = date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError): return selected == '__empty__'
    if selected == 'last12':
        # Matches the shared JS calendar-date rule, including leap-day rollover.
        start = date(today.year - 1, today.month, 1) + timedelta(days=today.day - 1)
        return start <= day <= today
    return selected in ('last30', 'last90') and 0 <= (today - day).days <= int(selected[4:])


def matches(row, state, query, today):
    context = row['context']
    text = ' '.join(str(v or '') for v in [row.get('filename'), row.get('display_name'), row.get('evidence_type'), row.get('uploader'), row.get('uploaded_by_email'), *row.get('years',[]),
        *[r.get(k) for r in [*context.values(), *row.get('references', [])] if r and r.get('available') for k in ('title', 'period', 'label', 'id', 'display_id', 'year', 'framework_key')]]).casefold()
    if query.casefold() not in text: return False
    for key, values in state.get('filters', {}).items():
        if key not in FILTERS or not values: continue
        value = row.get(key)
        if not any(date_match(value, v, today) if key in DATES else (not value if v == '__empty__' else v in value if isinstance(value,list) else value == v) for v in values): return False
    return True


async def catalog_page(db, cid, can_access, *, root_kind=None, root=None, oid=None, page=1, page_size=25, state=None, query='', today=None):
    state, today = state or {}, today or date.today()
    sort = state.get('sort') or {}
    key = sort.get('key') if sort.get('key') in SORTS else 'created_at'
    direction = 1 if sort.get('dir') == 'asc' else -1
    criteria = {'client_id': cid, **({} if root else {'archived_at': None})}
    cursor = db.evidence.find(criteria, {'_id': 0, 'content_base64': 0}).sort([(key, direction), ('evidence_id', 1)])
    total = matched = 0
    items, batch, counts, program_counts = [], [], {}, {}
    facets = {key: set() for key in FILTERS if key not in DATES}
    more_facets = False

    async def consume(chunk):
        nonlocal total, matched, more_facets
        for row in await enrich(db, chunk, cid, can_access):
            refresh = min((str(row[k])[:10] for k in ('expiration_date','refresh_date') if row.get(k)), default='')
            row['refresh_status'] = 'Not set' if not refresh else 'Expired / refresh overdue' if refresh < today.isoformat() else 'Due in 30 days' if refresh <= (today+timedelta(days=30)).isoformat() else 'Current'
            group = category(row, root_kind, root, oid) if root else 'library'
            if not group: continue
            if row.get('archived_at'):
                ref = row['context']['review'] or {}
                old = next((o for o in row['_review'].get('occurrences', []) if o.get('occurrence_id') == ref.get('occurrence_id')), {})
                retained = ALIASES.get(row.get('linked_type')) == 'reviews' and any(e.get('evidence_id') == row['evidence_id'] for e in old.get('evidence', []))
                if root_kind=='reviews': retained = retained or any(o.get('occurrence_id')==oid and any(e.get('evidence_id')==row['evidence_id'] for e in o.get('evidence',[])) for o in root.get('occurrences',[]))
                if root_kind=='policies': retained = retained or any(r['kind']=='policies' and r['id']==root['policy_id'] and r.get('module_owned') for r in row['references'])
                if not root or not retained: continue
            total += 1
            counts[group] = counts.get(group, 0) + 1
            for area in row['program_areas']: program_counts[area]=program_counts.get(area,0)+1
            for field, options in facets.items():
                value = row.get(field)
                for value in value if isinstance(value,list) else [value]:
                    if value and value not in options:
                        if len(options) < 200: options.add(value)
                        else: more_facets = True
            if matches(row, state, query, today):
                if (page - 1) * page_size <= matched < page * page_size:
                    items.append({**{k: v for k, v in row.items() if not k.startswith('_')}, 'category': group})
                matched += 1

    async for row in cursor:
        batch.append(row)
        if len(batch) == BATCH:
            await consume(batch)
            batch = []
    if batch: await consume(batch)
    return {'items': items, 'total': matched, 'unfiltered_total': total, 'page': page, 'page_size': page_size,
            'facets': {k: sorted(v) for k, v in facets.items()}, 'facets_limited': more_facets, 'counts': counts,'program_counts':program_counts}
