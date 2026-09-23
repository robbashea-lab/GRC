"""Organization-entered context, separate from catalog-owned compliance claims."""
from typing import Literal
from urllib.parse import urlsplit
from pydantic import BaseModel, ConfigDict, Field, field_validator


class GovernanceContext(BaseModel):
    model_config = ConfigDict(extra='forbid')
    category: Literal['', 'organizational', 'management', 'contractual', 'customer', 'risk', 'recommended', 'enhancement'] = ''
    rationale: str = Field(default='', max_length=4000)
    cadence_source: Literal['', 'organization_defined', 'risk_based', 'contractual', 'recommended'] = ''
    cadence_rationale: str = Field(default='', max_length=4000)
    citation: str = Field(default='', max_length=1000)
    reference_url: str = Field(default='', max_length=2000)

    @field_validator('reference_url')
    @classmethod
    def safe_reference(cls, value):
        if value:
            url = urlsplit(value)
            if url.scheme != 'https' or not url.hostname or url.username or url.password:
                raise ValueError('Reference must be an HTTPS URL without credentials')
        return value
