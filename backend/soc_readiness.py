"""Bounded internal readiness input, not audit sampling or attestation logic."""
from datetime import date
import re
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

Category = Literal['security','availability','confidentiality','processing_integrity','privacy']


def validate_period(start, end):
    if not start and not end:
        return
    if not start or not end:
        raise ValueError('Provide both evidence-period dates')
    for value in (start, end):
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
            raise ValueError('Use YYYY-MM-DD evidence-period dates')
        date.fromisoformat(value)
    if end < start:
        raise ValueError('Evidence period must end on or after its start')


class SocConfiguration(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    client_id: str = Field(min_length=1, max_length=160)
    expected_updated_at: Optional[str] = Field(default=None,max_length=100)
    categories: list[Category] = Field(default_factory=lambda: ['security'], min_length=1, max_length=5)
    system_description: str = Field(default='', max_length=4000)
    period_start: str = Field(default='', max_length=10)
    period_end: str = Field(default='', max_length=10)

    @model_validator(mode='after')
    def consistent_scope(self):
        if 'security' not in self.categories or len(set(self.categories)) != len(self.categories):
            raise ValueError('Common Criteria must remain in scope; categories must be unique')
        validate_period(self.period_start, self.period_end)
        return self


class ManagementControl(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    control_id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default='', max_length=4000)
    design: Literal['not_assessed','adequate','gap'] = 'not_assessed'
    operating: Literal['not_assessed','effective','gap'] = 'not_assessed'
    frequency: str = Field(default='', max_length=200)
    period_start: str = Field(default='', max_length=10)
    period_end: str = Field(default='', max_length=10)
    expected_instances: Optional[int] = Field(default=None, strict=True, ge=0, le=1000000)
    collected_instances: Optional[int] = Field(default=None, strict=True, ge=0, le=1000000)
    population_notes: str = Field(default='', max_length=4000)
    testing_notes: str = Field(default='', max_length=4000)

    @model_validator(mode='after')
    def consistent_period(self):
        validate_period(self.period_start, self.period_end)
        if (self.expected_instances is not None or self.collected_instances is not None) and not self.period_start:
            raise ValueError('Instance counts require a defined evidence period')
        return self


def configuration(client):
    return {'categories':['security'], 'system_description':'', 'period_start':'', 'period_end':'',
            **client.get('framework_settings', {}).get('soc-2', {}),
            'expected_updated_at':client.get('soc_configuration_updated_at')}
