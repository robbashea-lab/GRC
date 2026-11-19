"""CMMC 1/2 scope inside one retained native assessment namespace."""
from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def configuration(client):
    return {'level': 2, **(client or {}).get('framework_settings', {}).get('cmmc', {}),
            'expected_updated_at': (client or {}).get('cmmc_configuration_updated_at')}


def validate_settings(value):
    if not isinstance(value, dict) or set(value) - {'level'}:
        raise ValueError('Invalid CMMC configuration')
    if 'level' in value and (type(value['level']) is not int or value['level'] not in (1, 2)):
        raise ValueError('Choose CMMC Level 1 or Level 2')


class CmmcConfiguration(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, str_strip_whitespace=True)
    client_id: str = Field(min_length=1, max_length=160)
    level: Literal[1, 2]
    expected_updated_at: str | None = Field(default=None, max_length=100)
    confirm_reduction: bool = False
    reason: str = Field(default='', max_length=2000)
    effective_date: str = Field(default='', max_length=10)

    @field_validator('level', mode='before')
    @classmethod
    def strict_level(cls, value):
        if type(value) is not int or value not in (1, 2):
            raise ValueError('Choose CMMC Level 1 or Level 2')
        return value

    @field_validator('effective_date')
    @classmethod
    def valid_date(cls, value):
        if value and (date.fromisoformat(value).isoformat() != value
                      or date.fromisoformat(value) > datetime.now(timezone.utc).date()):
            raise ValueError('Use an effective date on or before today')
        return value
