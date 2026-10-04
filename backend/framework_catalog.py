"""Versioned framework catalogs, independent of client state and initialization."""
import json
from pathlib import Path

ROOT = Path(__file__).parents[1] / 'shared/catalogs'
FRAMEWORKS = json.loads((ROOT / 'frameworkDefinitions.json').read_text(encoding='utf-8'))['frameworks']
CIS = json.loads((ROOT / 'cisIG1.json').read_text(encoding='utf-8'))
HIPAA = json.loads((ROOT / 'hipaaSecurityRule.json').read_text(encoding='utf-8'))
ISO = json.loads((ROOT / 'iso27001.json').read_text(encoding='utf-8'))
SOC = json.loads((ROOT / 'soc2.json').read_text(encoding='utf-8'))
NIST = json.loads((ROOT / 'nistCSF2.json').read_text(encoding='utf-8'))
CATALOGS = {'cis-ig1': CIS, 'hipaa': HIPAA, 'iso-27001': ISO, 'soc-2': SOC, 'nist-csf-2': NIST}


def capabilities(framework_key):
    """Product features only; callers must authorize the tenant and action first."""
    return next((f.get('capabilities', []) for f in FRAMEWORKS if f['key'] == framework_key), [])


def active_definitions(key, configuration=None):
    definitions = CATALOGS.get(key, {}).get('requirements', [])
    if key == 'soc-2':
        categories = (configuration or {}).get('categories', ['security'])
        return [d for d in definitions if d['category'] in categories]
    if key == 'cis-ig1':
        return [d for d in definitions if d.get('implementation_group', 1) <= (configuration or {}).get('implementation_group', 1)]
    return definitions


def client_configuration(key, client, state=None):
    if key == 'soc-2':
        from soc_readiness import configuration
        return configuration(client or {})
    if key == 'cis-ig1':
        from cis_scope import configuration
        return {**configuration(client), **(state or {}).get('framework_settings', {}).get(key, {})}
    return {}


def active_plans(key, configuration=None):
    allowed = {d['id'] for d in active_definitions(key, configuration)}
    return [{**p, 'safeguards': [ident for ident in p['safeguards'] if ident in allowed]}
            for p in CATALOGS[key]['review_plans'] if any(ident in allowed for ident in p['safeguards'])]


def definition_for(framework_key, definition_id):
    return next((d for d in CATALOGS.get(framework_key, {}).get('requirements', [])
                 if d['id'] == definition_id), {})


def assessment_title(row):
    definition = definition_for(row['framework_key'], row['definition_id'])
    label = CATALOGS.get(row['framework_key'], {}).get('label') or ('CIS' if row['framework_key'] == 'cis-ig1' else row['framework_key'].upper())
    return f"{label} {row['definition_id']} · {definition.get('title', row['definition_id'])}"
