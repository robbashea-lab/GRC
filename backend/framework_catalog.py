"""Versioned framework catalogs, independent of client state and initialization."""
import json
from pathlib import Path

ROOT = Path(__file__).parents[1] / 'frontend/src/lib'
CIS = json.loads((ROOT / 'cisIG1.json').read_text(encoding='utf-8'))
HIPAA = json.loads((ROOT / 'hipaaSecurityRule.json').read_text(encoding='utf-8'))
ISO = json.loads((ROOT / 'iso27001.json').read_text(encoding='utf-8'))
CATALOGS = {'cis-ig1': CIS, 'hipaa': HIPAA, 'iso-27001': ISO}


def definition_for(framework_key, definition_id):
    return next((d for d in CATALOGS.get(framework_key, {}).get('requirements', [])
                 if d['id'] == definition_id), {})


def assessment_title(row):
    definition = definition_for(row['framework_key'], row['definition_id'])
    label = CATALOGS.get(row['framework_key'], {}).get('label') or ('CIS' if row['framework_key'] == 'cis-ig1' else row['framework_key'].upper())
    return f"{label} {row['definition_id']} · {definition.get('title', row['definition_id'])}"
