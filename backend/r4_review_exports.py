"""Completed-occurrence population export; never regenerate historic checklists."""
import csv
import io
import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

import r4_services
import review_occurrences
import security_runtime

COLUMNS = ['Review', 'Type', 'Origin', 'Period', 'Due date', 'Completed on', 'Completed by',
           'Outcome', 'Recurring ticket', "This cycle's ticket", 'Checklist', 'Exceptions',
           'Evidence files', 'Evidence count', 'Notes', 'Occurrence ID', 'Record source',
           'Supporting result reference', 'Support to record', 'Evidence IDs']


def interval(from_date, to_date):
    try:
        if not all(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value) for value in (from_date, to_date)):
            raise ValueError()
        start, end = date.fromisoformat(from_date), date.fromisoformat(to_date)
        if start > end:
            raise ValueError()
    except (TypeError, ValueError):
        raise HTTPException(422, 'Choose a valid start date on or before the end date')
    return start.isoformat(), end.isoformat()


def completed_rows(reviews, start, end):
    result, seen = [], set()
    for review in reviews:
        occurrences = list(review.get('occurrences') or [])
        if review.get('status') == 'completed' and not occurrences:
            old = review.get('completion_snapshot') or {}
            occurrences = [{**review, 'occurrence_id': review_occurrences.occurrence_id(review),
                            'completed_at': review.get('completion_date') or old.get('at'),
                            'completed_by': old.get('by'), 'legacy': True}]
        for occurrence in occurrences:
            completed = str(occurrence.get('completed_at') or occurrence.get('completion_date') or '')
            ident = (review['review_id'], occurrence.get('occurrence_id'))
            if not completed or not start <= completed[:10] <= end or ident in seen:
                continue
            seen.add(ident)
            # Coverage is attributed to its actual source, never relabelled as a
            # child checklist entered by the reviewer.
            coverage = occurrence.get('coverage_evaluation')
            evaluation = coverage or occurrence
            checklist = evaluation.get('checklist') or {}
            steps = evaluation.get('checklist_results') or checklist.get('steps') or []
            counts = {value: sum(step.get('result') == value for step in steps)
                      for value in ('Pass', 'Exception', 'N/A', 'NMI')}
            summary = (', '.join(f'{counts[value]} {label}' for value, label in
                       [('Pass', 'pass'), ('Exception', 'exceptions'), ('N/A', 'not applicable'), ('NMI', 'not managed by iVenture')])
                       if steps else 'Not recorded')
            if coverage:
                summary = 'Annual coverage from ' + str(coverage.get('source_review_id')) + ': ' + summary
            evidence = occurrence.get('evidence') or []
            setup = occurrence.get('activity_setup') or {}
            origin = occurrence.get('source') or occurrence.get('framework_basis') or ''
            if not isinstance(origin, str):
                origin = str(origin)
            result.append([occurrence.get('title') or review.get('title'), occurrence.get('review_type') or '', origin,
                           occurrence.get('period') or '', occurrence.get('due_date') or '', completed,
                           occurrence.get('completed_by_name') or occurrence.get('completed_by') or 'Not recorded',
                           evaluation.get('checklist_outcome') or occurrence.get('outcome') or '', setup.get('recurring_ticket_number') or '',
                           setup.get('cycle_ticket_number') or '', summary,
                           ' | '.join(str(step.get('text') or step.get('t') or '') +
                                      (' — ' + str(step.get('reason') or step.get('note')) if step.get('reason') or step.get('note') else '')
                                      for step in steps if step.get('result') == 'Exception'),
                           '; '.join(str(item.get('filename') or item.get('evidence_id') or '') for item in evidence),
                           len(evidence), occurrence.get('notes') or '', occurrence.get('occurrence_id') or '',
                           'Retained legacy record' if occurrence.get('legacy') else 'Completed in GoverNara',
                           evaluation.get('supporting_reference') or checklist.get('supporting_reference') or '',
                           '; '.join(checklist.get('required_support') or []),
                           '; '.join(str(item.get('evidence_id') or '') for item in evidence)])
    return sorted(result, key=lambda row: (str(row[0] or '').casefold(), row[5], row[15]))


def csv_bytes(rows):
    output = io.StringIO(newline='')
    writer = csv.writer(output)
    writer.writerow(COLUMNS)
    writer.writerows([[security_runtime.csv_cell(value) for value in row] for row in rows])
    return output.getvalue().encode('utf-8')


def router_for(s):
    router = APIRouter(prefix='/api')

    @router.get('/reviews/completions/export')
    async def export_completions(client_id: str, from_date: str, to_date: str,
                                 user=Depends(s.get_current_user)):
        start, end = interval(from_date, to_date)
        query = s._scope_filter(user, client_id)
        client = await s.db.clients.find_one({'client_id': client_id})
        if not client:
            raise HTTPException(404, 'Client not found')
        r4_services.assert_settled(client)
        reviews = await s._bounded(s.db.reviews.find(query, {'_id': 0}), 10000, 'Reviews')
        for review in reviews:
            r4_services.assert_settled(review)
        rows = completed_rows(reviews, start, end)
        if len(rows) > 100000:
            raise HTTPException(413, 'Narrow the completion period; no partial export was generated')
        # Filename has no client-supplied text or untrusted header characters.
        filename = f'completed-reviews-{start}-to-{end}.csv'
        return Response(csv_bytes(rows), media_type='text/csv; charset=utf-8',
                        headers={'Content-Disposition': f'attachment; filename="{filename}"'})

    return router
