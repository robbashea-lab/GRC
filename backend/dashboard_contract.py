"""Bounded dashboard presentation of the authoritative management model.

No writes or independent scheduling. Full records are fetched by authorized ID
only when opened; detail pages use the same contributing populations as counts.
"""
from datetime import date
from grc_rules import assessed_risk, represented_finding
from management_obligations import KINDS, calendar_day
import vendor_governance

PREVIEW_LIMIT = 25
PROJECTION = {key: 1 for key in (
    *KINDS.values(), 'client_id', 'title', 'name', 'status', 'archived', 'archived_at',
    'owner_id', 'reviewer_id', 'assignee_id', 'business_owner_id', 'approver_id',
    'due_date', 'next_review', 'next_review_date', 'expires_at', 'acceptance_expires_at',
    'severity', 'priority', 'criticality', 'risk_score', 'risk_level', 'likelihood', 'impact',
    'likelihood_score', 'impact_score', 'recurrence', 'custom_recurrence_days', 'schedule_anchor',
    'current_occurrence_id', 'review_type', 'vendor_purpose', 'last_reviewed', 'date_identified',
    'created_at', 'completion_date', 'last_review', 'service', 'services', 'assurance_required',
    'assurance_records', 'assurance_window_days', 'assurance_expires_at', 'assurance_status',
    'contract_renewal', 'contract_expiration', 'contract_end', 'contract_lead_days',
    'applicability', 'baseline_key', 'baseline_response')}
PROJECTION['_id'] = 0


def brief(row):
    kind = row['kind']
    result = {key: row.get(key) for key in (
        'key', 'id', 'kind', 'event', 'type', 'due_date', 'owner_id', 'unassigned', 'status', 'severity')}
    result.update(title=str(row.get('title') or '')[:240], owner=str(row.get('owner') or 'Assigned user')[:200],
                  priority_label=row.get('priority_label') or (row.get('severity') or 'Attention').capitalize(),
                  action={'reviews':'Open Review','tasks':'Open Action','policies':'Open Policy','vendors':'Open Vendor',
                          'exceptions':'Open Acceptance','requirements':'Open Requirement','risks':'View Risk','findings':'View Finding'}[kind],
                  record={'client_id':row['record']['client_id'], KINDS[kind]:row['id']})
    return result


def populations(model):
    day = calendar_day(model['as_of'])
    active, work = model['activeRecords'], model['work']
    def record_row(record, kind, label, severity):
        owner = record.get('owner_id') or record.get('assignee_id') or record.get('business_owner_id')
        due = record.get('due_date') or record.get('next_review')
        return {'key':f'{kind}:{record[KINDS[kind]]}:record', 'id':record[KINDS[kind]],
                'kind':kind, 'record':record, 'type':label, 'title':record.get('title') or record.get('name') or label,
                'owner_id':owner, 'owner':'Assigned user' if owner else 'Unassigned', 'unassigned':not owner,
                'status':record.get('status'), 'due_date':due, 'day':calendar_day(due), 'severity':severity}
    risks = [record_row(r,'risks','Risk',assessed_risk(r)['risk_level']) for r in active['risks']]
    groups = {
        'pastDue':model['metrics']['past_due'], 'due30':model['metrics']['due_30d'],
        'due3190':model['metrics']['due_31_90d'], 'materialFindings':model['materialFindings'],
        'significantRisks':model['significantRisks'],
        'inProgress':[r for r in work if r['status']=='in_progress' and (r['day'] is None or r['day']>=day)],
        'otherDue30':[r for r in model['metrics']['due_30d'] if r['status']!='in_progress'],
        'scheduled':[r for r in work if r['day'] is not None and r['day']>day+30 and r['status']!='in_progress'],
        'unscheduled':[r for r in work if r['day'] is None and r['status']!='in_progress'],
    }
    for level in ('critical','high','moderate','low',None):
        groups['risk-'+(level or 'unassessed')] = [r for r in risks if r['severity']==level]
    groups['acceptedRisks'] = [r for r in risks if r['status']=='accepted']
    vendor_reviews = [r for r in work if
                      r['kind']=='reviews' and r['record'].get('vendor_id') and (r['record'].get('vendor_purpose') or 'vendor')=='vendor'
                      or r['kind']=='vendors' and r['event']=='review']
    groups['vendorReviewsPast'] = [r for r in vendor_reviews if r['day'] is not None and r['day']<day]
    groups['vendorReviewsSoon'] = [r for r in vendor_reviews if r['day'] is not None and day<=r['day']<=day+30]
    for key in ('vendorReviews','assurance','contracts','criticalVendors','missingAssurance'):
        groups[key] = []
    primary_vendors = {r.get('vendor_id') for r in active['reviews'] if (r.get('vendor_purpose') or 'vendor')=='vendor'}
    for vendor in active['vendors']:
        row=record_row(vendor,'vendors','Vendor',vendor.get('criticality'))
        due=calendar_day(vendor.get('next_review'))
        contract=calendar_day(vendor.get('contract_renewal') or vendor.get('contract_expiration') or vendor.get('contract_end'))
        if vendor['vendor_id'] in primary_vendors and due is not None and due<=day+90:groups['vendorReviews'].append(row)
        if contract is not None and contract<=day+(vendor.get('contract_lead_days') or 90):groups['contracts'].append(row)
        if vendor.get('criticality')=='critical':groups['criticalVendors'].append(row)
        required = [a for a in vendor.get('assurance_records') or [] if a.get('required') is not False]
        if vendor.get('assurance_required') and (not required or any(vendor_governance.assurance_status(vendor,a,date.fromordinal(day))=='missing' for a in required)):
            groups['missingAssurance'].append(row)
        if vendor.get('assurance_required') and any(
            vendor_governance.assurance_status(vendor,a,date.fromordinal(day)) in ('expired','due_soon','missing')
            or a.get('required') is not False and calendar_day(a.get('received_at')) is None
            for a in vendor.get('assurance_records') or []):groups['assurance'].append(row)
    attention = [r for r in work if (r['day'] is not None and r['day']<=day+14)
                 or r['severity'] in ('critical','high') or r['status']=='remediated'
                 or r['day'] is None and (r['unassigned'] or r['kind']=='reviews')
                 or r['kind']=='risks' and not assessed_risk(r['record'])['risk_level'] and r['status']!='accepted']
    for row in attention:
        timing = ('Pending validation' if row['status']=='remediated' else
                  'Needs scheduling' if row['kind']=='reviews' and row['day'] is None else
                  'Overdue' if row['day'] is not None and row['day']<day else
                  'Due within 14 days' if row['day'] is not None and row['day']<=day+14 else
                  'Needs assessment' if row['kind']=='risks' and not assessed_risk(row['record'])['risk_level'] else
                  'Unassigned' if row['unassigned'] else 'Open')
        row['priority_label'] = (row['severity'].capitalize()+' · ' if row['severity'] in ('critical','high') else '')+timing
    tasks_by_finding = {}
    for task in active['tasks']:tasks_by_finding.setdefault(task.get('finding_id'),[]).append(task)
    priority = attention + [r for r in model['materialFindings'] if not represented_finding(r['record'],tasks_by_finding.get(r['id'],[]))] + model['significantRisks']
    def rank(r):
        if r['day'] is not None and r['day']<day:return 0 if r['severity']=='critical' else 1 if r['severity']=='high' else 2
        return 3 if r['severity'] in ('critical','high') else 4 if r['unassigned'] else 5
    priority.sort(key=lambda r:(rank(r),r['day'] if r['day'] is not None else float('inf'),r['title'],r['key']))
    unique={}
    for row in priority:unique.setdefault((row['kind'],row['id']),row)
    # A Finding whose own open Action is already listed is the same remediation work; list it once, as the Action.
    listed_findings={row['record'].get('finding_id') for row in unique.values() if row['kind']=='tasks'}
    groups['priority']=[row for row in unique.values() if not (row['kind']=='findings' and row['id'] in listed_findings)]
    for key, rows in groups.items():
        if key != 'priority':
            rows.sort(key=lambda r:(r['day'] if r['day'] is not None else float('inf'),r['key']))
    return groups


def summary(groups):
    result = {key:[brief(row) for row in rows[:PREVIEW_LIMIT]] for key,rows in groups.items()}
    result['totals'] = {key:len(rows) for key,rows in groups.items()}
    result['preview_limit'] = PREVIEW_LIMIT
    def distribution(definitions):
        return [dict(key=key,label=label,tone=tone,items=result[key],total=len(groups[key])) for key,label,tone in definitions]
    result['buckets']=distribution([
        ('pastDue','Past Due','bg-semantic-critical'),('inProgress','In Progress','bg-semantic-info'),
        ('otherDue30','Due Next 30 Days','bg-semantic-duesoon'),('scheduled','Scheduled','bg-ink-muted'),
        ('unscheduled','No Date / Unscheduled','bg-line-strong')])
    result['riskLevels']=distribution([('risk-'+level,label,'bg-semantic-critical' if level=='critical' else 'bg-semantic-duesoon' if level=='high' else 'bg-ink-muted')
                                      for level,label in [('critical','Critical'),('high','High'),('moderate','Moderate'),('low','Low'),('unassessed','Not Assessed')]])
    result['vendorHealth']=distribution([(key,label,'') for key,label in [('vendorReviewsPast','Vendor Reviews Past Due'),('vendorReviewsSoon','Vendor Reviews Due in 30 Days'),('assurance','Assurance Needs Attention'),('contracts','Contracts Expiring'),('criticalVendors','Critical Vendors'),('missingAssurance','Missing Required Assurance')]])
    return result
