"""Read-only Evidence context. Batch lookups, bounded pages, no copied ownership."""
import json
from pathlib import Path
from datetime import date, timedelta
import review_occurrences

SOURCES = json.loads((Path(__file__).parents[1] / 'frontend/src/lib/evidenceSources.json').read_text())
ALIASES = {alias: kind for kind, spec in SOURCES.items() for alias in spec['aliases']}
FILTERS = ('mime_type', 'uploaded_by_email', 'linked_type', 'created_at')
SORTS = ('filename', *FILTERS)
BATCH = 100


def reference(kind, row, ident=None, occurrence=None):
    spec = SOURCES[kind]
    result = {'kind': kind, 'id': ident or (row or {}).get(spec['key']), 'label': spec['label'],
              'available': bool(row), 'title': (row or {}).get('title') or (row or {}).get('name') or 'Source unavailable'}
    if row:
        result['status'] = row.get('status')
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
        kind = ALIASES.get(row.get('linked_type'))
        if kind and row.get('linked_id'):
            needed[kind].add(row['linked_id'])
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
        # Private matching metadata is discarded before returning rows.
        row['_source'] = source
        row['_review'] = review
        result.append(row)
    return result


def category(row, root_kind, root, oid):
    source, ctx = row['_source'], row['context']
    kind = ALIASES.get(row.get('linked_type'))
    ident = root.get(SOURCES[root_kind]['key'])
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
    text = ' '.join(str(v or '') for v in [row.get('filename'), row.get('uploader'), row.get('uploaded_by_email'),
        *[r.get(k) for r in context.values() if r for k in ('title', 'period', 'label')]]).casefold()
    if query.casefold() not in text: return False
    for key, values in state.get('filters', {}).items():
        if key not in FILTERS or not values: continue
        value = row.get(key)
        if not any(date_match(value, v, today) if key == 'created_at' else (not value if v == '__empty__' else value == v) for v in values): return False
    return True


async def catalog_page(db, cid, can_access, *, root_kind=None, root=None, oid=None, page=1, page_size=25, state=None, query='', today=None):
    state, today = state or {}, today or date.today()
    sort = state.get('sort') or {}
    key = sort.get('key') if sort.get('key') in SORTS else 'created_at'
    direction = 1 if sort.get('dir') == 'asc' else -1
    criteria = {'client_id': cid, **({} if root else {'archived_at': None})}
    cursor = db.evidence.find(criteria, {'_id': 0, 'content_base64': 0}).sort([(key, direction), ('evidence_id', 1)])
    total = matched = 0
    items, batch, counts = [], [], {}
    facets = {key: set() for key in FILTERS if key != 'created_at'}
    more_facets = False

    async def consume(chunk):
        nonlocal total, matched, more_facets
        for row in await enrich(db, chunk, cid, can_access):
            group = category(row, root_kind, root, oid) if root else 'library'
            if not group: continue
            if row.get('archived_at'):
                ref = row['context']['review'] or {}
                old = next((o for o in row['_review'].get('occurrences', []) if o.get('occurrence_id') == ref.get('occurrence_id')), {})
                retained = ALIASES.get(row.get('linked_type')) == 'reviews' and any(e.get('evidence_id') == row['evidence_id'] for e in old.get('evidence', []))
                if not root or not retained: continue
            total += 1
            counts[group] = counts.get(group, 0) + 1
            for field, options in facets.items():
                value = row.get(field)
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
            'facets': {k: sorted(v) for k, v in facets.items()}, 'facets_limited': more_facets, 'counts': counts}
