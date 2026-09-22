"""Explicit client outcome planning, not an inferred maturity score."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class CsfProfile(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    target_selected: bool = Field(default=False, strict=True)
    target_outcome: str = Field(default='', max_length=4000)
    priority: Literal['','low','medium','high','critical'] = ''
    gap_state: Literal['not_evaluated','gap','aligned'] = 'not_evaluated'
    gap_notes: str = Field(default='', max_length=4000)

    @model_validator(mode='after')
    def explicit_decision(self):
        if self.target_selected and not self.target_outcome:
            raise ValueError('Describe the selected target outcome')
        if self.gap_state != 'not_evaluated' and (not self.target_selected or not self.gap_notes):
            raise ValueError('A gap decision requires a selected target and comparison rationale')
        return self
