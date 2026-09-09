"""Operational definitions shared with the frontend (no database writes)."""
import json
from pathlib import Path

RULES = json.loads((Path(__file__).resolve().parents[1] / 'frontend/src/lib/grcRules.json').read_text())
CLOSED = RULES['closed']

def is_open(kind, row):
    return row.get('status') not in CLOSED.get(kind, [])

def risk_level(score):
    return next((name for minimum, name in RULES['riskBands'] if score is not None and score >= minimum), None)

def assessed_risk(row):
    values = [row.get('likelihood_score'), row.get('impact_score')]
    score = values[0] * values[1] if all(type(v) is int and 1 <= v <= 5 for v in values) else None
    return {**row, 'risk_score': score, 'risk_level': risk_level(score)}

def risk_due(row):
    dates = [row.get('next_review'), row.get('acceptance_expires_at') if row.get('status') == 'accepted' else None]
    return min((d for d in dates if d), default=None)

def represented_finding(finding, tasks):
    return is_open('findings', finding) and finding.get('status') != 'remediated' and any(
        is_open('tasks', t) and t.get('client_id') == finding.get('client_id') and t.get('finding_id') == finding.get('finding_id')
        and (t.get('due_date') or '')[:10] == (finding.get('due_date') or '')[:10]
        and (t.get('assignee_id') or t.get('owner_id') or '') == (finding.get('owner_id') or '') for t in tasks)
