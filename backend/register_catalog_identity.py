"""Allowlisted decorative catalog identities; names and providers are never evidence."""
import json

from framework_catalog import ROOT


_REGISTRY = json.loads((ROOT / 'registerCatalogIdentity.json').read_text(encoding='utf-8'))
_KEYS = {kind: frozenset(entries) for kind, entries in _REGISTRY.items()}


def validate_catalog_key(kind, value):
    if value is None:
        return None
    if type(value) is not str or value not in _KEYS[kind]:
        raise ValueError('Invalid catalog key')
    return value
