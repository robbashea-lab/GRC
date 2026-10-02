"""Canonical incoming aliases; persisted legacy fields remain readable."""
import json

from fastapi import HTTPException
from framework_catalog import ROOT

WRITE_ALIASES = json.loads((ROOT / 'recordAliases.json').read_text(encoding='utf-8'))


def normalize_write(kind, body, existing=None):
    result = dict(body)
    for alias, canonical in WRITE_ALIASES.get(kind, {}).items():
        if alias in result:
            if canonical in result and result[canonical] != result[alias]:
                raise HTTPException(422, f'Conflicting values for {canonical} and legacy {alias}')
            result[canonical] = result.pop(alias)
        # Explicit canonical edits also own an existing compatibility alias;
        # otherwise a cleared value would reappear through legacy read fallback.
        if canonical in result and alias in (existing or {}):
            result[alias] = result[canonical]
    return result
