"""Client scope inside the original CIS v8.1 assessment namespace."""
from datetime import date, datetime, timezone
from typing import Literal, Optional
from framework_catalog import CIS
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator


def available_groups():
    # Explicit release gate: IG3 content and authorization are not yet delivered.
    return CIS['available_implementation_groups']


def configuration(client):
    return {'implementation_group': 1,
            **(client or {}).get('framework_settings', {}).get('cis-ig1', {}),
            'expected_updated_at': (client or {}).get('cis_configuration_updated_at')}


def validate_settings(settings):
    if not isinstance(settings, dict) or set(settings) - {'cis-ig1'}:
        raise ValueError('Invalid onboarding framework settings')
    cis = settings.get('cis-ig1', {})
    if not isinstance(cis, dict) or set(cis) - {'implementation_group'} or (
            'implementation_group' in cis and (type(cis['implementation_group']) is not int or cis['implementation_group'] not in available_groups())):
        raise ValueError('CIS implementation group is not available')


class CisConfiguration(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    client_id: str = Field(min_length=1, max_length=160)
    implementation_group: Literal[1, 2, 3]
    expected_updated_at: Optional[str] = Field(default=None, max_length=100)
    confirm_reduction: bool = Field(default=False, strict=True)
    reason: str = Field(default='', max_length=2000)
    effective_date: str = Field(default='', max_length=10)

    @field_validator('implementation_group', mode='before')
    @classmethod
    def strict_group(cls, value):
        if type(value) is not int or value not in available_groups():
            raise ValueError('CIS implementation group is not available')
        return value

    @model_validator(mode='after')
    def valid_context(self):
        if self.effective_date:
            if date.fromisoformat(self.effective_date).isoformat() != self.effective_date or date.fromisoformat(self.effective_date) > datetime.now(timezone.utc).date():
                raise ValueError('Use an effective date on or before today')
        return self
