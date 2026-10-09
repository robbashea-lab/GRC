# Omnibot question-to-field matrix

This maps the refined presentation to the unchanged production catalogs. Stored values, matrix row choices, conditional visibility and evaluator meaning remain authoritative. Fields use the existing versioned interview API; native fields change only through reviewed Use summary followed by Save assessment.

The group-coverage regression exercises all production IDs and root branches; canonical evaluator/version suites cover substantive criteria. Named lifecycle cases cover field-specific persistence and protections.

## Safeguard 1.1 — `cis-v8.1-control1-3`

| Production ID | Refined wording / group | Retained value and condition | Persistence field | Summary output | Regression coverage |
| --- | --- | --- | --- | --- | --- |
| inventory | Does an enterprise asset inventory exist? / Inventory | select; Yes, Partially, No, Not sure; Always within this safeguard | answers.inventory | Opening and Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| existing | What asset information currently exists, and who can verify it? / Inventory | text; {"inventory": ["No", "Not sure"]} | answers.existing | Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| system | Where do you maintain your inventory? / Inventory | text; {"inventory": ["Yes", "Partially"]} | answers.system | Opening and Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| sources | Do you use one inventory or combine several sources? / Inventory | select; One source, Multiple reconciled sources, Multiple unreconciled sources, Not sure; {"inventory": ["Yes", "Partially"]} | answers.sources | Recorded implementation | Source option switch, Back, save/reopen |
| owner | Who keeps it up to date? / Inventory | text; {"inventory": ["Yes", "Partially"]} | answers.owner | Opening and Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| coverage | Does the inventory cover all of these assets? / Asset coverage | matrix; Yes, Partially, No, Not sure, Not applicable; {"inventory": ["Yes", "Partially"]} | answers.coverage | Asset coverage and Items to address or confirm | Group coverage; canonical evaluator; interview persistence |
| attributes | Does each asset record have the details you need? / Inventory details | matrix; Yes, Partially, No, Not sure, Not applicable; {"inventory": ["Yes", "Partially"]} | answers.attributes | Required asset details and Items to address or confirm | Group coverage; canonical evaluator; interview persistence |
| scope_reason | Explain any non-applicable categories or attributes and how applicability was confirmed. / Asset coverage | text; Existing not_applicable condition | answers.scope_reason | Scope explanations | Group coverage; canonical evaluator; interview persistence |
| maintenance | Is the inventory updated when assets change? / Keeping it current | select; Yes, Partially, No, Not sure; {"inventory": ["Yes", "Partially"]} | answers.maintenance | Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| maintenance_detail | How are those changes handled? / Keeping it current | text; {"inventory": ["Yes", "Partially"]} | answers.maintenance_detail | Recorded implementation | Context does not overwrite update process |
| frequency | How often is the complete inventory reviewed? / Review and reconciliation | select; Monthly, Quarterly, Every six months, Annually, Ad hoc, Not sure; {"inventory": ["Yes", "Partially"]} | answers.frequency | Opening and Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| last_review | When was the last complete review? / Review and reconciliation | date; {"inventory": ["Yes", "Partially"]} | answers.last_review | Opening and Recorded implementation | Date input survives following edit and save |
| reconciled | Do you compare the inventory with other device records? / Review and reconciliation | select; Yes, Partially, No, Not sure; {"inventory": ["Yes", "Partially"]} | answers.reconciled | Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| evidence | What evidence is available, and what would it demonstrate? / Review and reconciliation | text; Always within this safeguard | answers.evidence | Items to address or confirm | Group coverage; canonical evaluator; interview persistence |
| gaps | Describe any confirmed missing or incomplete requirement elements. / Review and reconciliation | text; Always within this safeguard | answers.gaps | Items to address or confirm, marked deficiency | Group coverage; canonical evaluator; interview persistence |
| unknowns | Which requirement elements still need confirmation, and who can verify them? / Review and reconciliation | text; Always within this safeguard | answers.unknowns | Items to address or confirm, marked confirmation needed | Group coverage; canonical evaluator; interview persistence |

### Contextual detail fields

| UI field | Condition | Existing persistence extension | Summary output | Regression coverage |
| --- | --- | --- | --- | --- |
| Known gaps or uncertainties / Inventory | Optional; shown when group is active | `answers.inventory_detail` | Attributed context in Items to address or confirm; no new scoring rule | Detail-key independence; canonical-status preservation; checkpoint/reopen |
| Known gaps or uncertainties / Asset coverage | Optional; shown when group is active | `answers.coverage_detail` | Attributed context in Items to address or confirm; no new scoring rule | Detail-key independence; canonical-status preservation; checkpoint/reopen |
| Known gaps or uncertainties / Inventory details | Optional; shown when group is active | `answers.attributes_detail` | Attributed context in Items to address or confirm; no new scoring rule | Detail-key independence; canonical-status preservation; checkpoint/reopen |
| Known gaps or uncertainties / Keeping it current | Optional; shown when group is active | `answers.maintenance_detail_detail` | Attributed context in Items to address or confirm; no new scoring rule | Detail-key independence; canonical-status preservation; checkpoint/reopen |
| Known gaps or uncertainties / Review and reconciliation | Optional; shown when group is active | `answers.evidence_detail` | Attributed context in Items to address or confirm; no new scoring rule | Detail-key independence; canonical-status preservation; checkpoint/reopen |
| Which sources do you combine? | Either existing multiple-source option in active inventory branch | `answers.sources_detail` | Recorded source explanation; inactive detail excluded | Source option switch, Back, save/reopen; summary filtering |

Matrix rows retain production labels and row-specific choices. Confirmed exclusions retain existing scope-rationale requirements; uncertainty is not converted to an exclusion.

## Safeguard 1.2 — `cis-v8.1-control1-2`

| Production ID | Refined wording / group | Retained value and condition | Persistence field | Summary output | Regression coverage |
| --- | --- | --- | --- | --- | --- |
| process | Does a documented or consistently followed process address unauthorized assets? / Current process | select; Yes, Partially, No, Not sure; Always within this safeguard | answers.process | Opening and Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| existing | What happens today when an unauthorized asset is discovered, and who can verify it? / Current process | text; {"process": ["No", "Not sure"]} | answers.existing | Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| inventory_dependency | Is a usable authorized asset inventory available for comparison? / Identification | select; Yes, Partially, No, Not sure; {"process": ["Yes", "Partially"]} | answers.inventory_dependency | Handling and confirmation | Group coverage; canonical evaluator; interview persistence |
| detection | Are unauthorized assets consistently identified using relevant systems and reports? / Identification | select; Yes, Partially, No, Not sure; {"process": ["Yes", "Partially"]} | answers.detection | Handling and confirmation | Group coverage; canonical evaluator; interview persistence |
| system | Which detection systems, alerts, or teams identify unauthorized assets? / Current process | text; {"process": ["Yes", "Partially"]} | answers.system | Opening and Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| owner | Who investigates and responds? Include client and provider responsibilities. / Current process | text; {"process": ["Yes", "Partially"]} | answers.owner | Opening and Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| frequency | How frequently are unauthorized assets reviewed and addressed? / Response | select; Daily or more frequently, Weekly, Every two weeks, Monthly, Ad hoc, Not sure; {"process": ["Yes", "Partially"]} | answers.frequency | Opening and Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| actions | Which permitted response actions are consistently used? / Response | multi; Remove from network, Deny remote connection, Quarantine or isolate, None, Not sure; {"process": ["Yes", "Partially"]} | answers.actions | Recorded implementation | Group coverage; canonical evaluator; interview persistence |
| disposition | Are disposition decisions consistently tracked? / Response | select; Yes, Partially, No, Not sure; {"process": ["Yes", "Partially"]} | answers.disposition | Handling and confirmation | Group coverage; canonical evaluator; interview persistence |
| confirmation | Is it confirmed that the asset is no longer reachable or has otherwise been addressed? / Response | select; Yes, Partially, No, Not sure; {"process": ["Yes", "Partially"]} | answers.confirmation | Handling and confirmation | Group coverage; canonical evaluator; interview persistence |
| exceptions | Are exceptions approved and tracked when used? / Exceptions and reconciliation | select; Yes, Partially, No, Not sure, No exceptions used; {"process": ["Yes", "Partially"]} | answers.exceptions | Handling and confirmation | Group coverage; canonical evaluator; interview persistence |
| reconciled | Are unauthorized assets reconciled against the authorized inventory? / Exceptions and reconciliation | select; Yes, Partially, No, Not sure; {"process": ["Yes", "Partially"]} | answers.reconciled | Handling and confirmation | Group coverage; canonical evaluator; interview persistence |
| unresolved | Do unauthorized assets remain unresolved beyond the required response interval? / Exceptions and reconciliation | select; Yes, Partially, No, Not sure; {"process": ["Yes", "Partially"]} | answers.unresolved | Handling and confirmation | Group coverage; canonical evaluator; interview persistence |
| evidence | What evidence is retained and what does it demonstrate? / Review and confirmation | text; Always within this safeguard | answers.evidence | Items to address or confirm | Group coverage; canonical evaluator; interview persistence |
| gaps | Describe any confirmed missing or incomplete requirement elements. / Review and confirmation | text; Always within this safeguard | answers.gaps | Items to address or confirm, marked deficiency | Group coverage; canonical evaluator; interview persistence |
| unknowns | Which requirement elements still need confirmation, and who can verify them? / Review and confirmation | text; Always within this safeguard | answers.unknowns | Items to address or confirm, marked confirmation needed | Group coverage; canonical evaluator; interview persistence |

### Contextual detail fields

| UI field | Condition | Existing persistence extension | Summary output | Regression coverage |
| --- | --- | --- | --- | --- |
| Known gaps or uncertainties / Current process | Optional; shown when group is active | `answers.process_detail` | Attributed context in Items to address or confirm; no new scoring rule | Detail-key independence; canonical-status preservation; checkpoint/reopen |
| Known gaps or uncertainties / Identification | Optional; shown when group is active | `answers.detection_detail` | Attributed context in Items to address or confirm; no new scoring rule | Detail-key independence; canonical-status preservation; checkpoint/reopen |
| Known gaps or uncertainties / Response | Optional; shown when group is active | `answers.actions_detail` | Attributed context in Items to address or confirm; no new scoring rule | Detail-key independence; canonical-status preservation; checkpoint/reopen |
| Known gaps or uncertainties / Exceptions and reconciliation | Optional; shown when group is active | `answers.exceptions_detail` | Attributed context in Items to address or confirm; no new scoring rule | Detail-key independence; canonical-status preservation; checkpoint/reopen |
| Known gaps or uncertainties / Review and confirmation | Optional; shown when group is active | `answers.evidence_detail` | Attributed context in Items to address or confirm; no new scoring rule | Detail-key independence; canonical-status preservation; checkpoint/reopen |

Matrix rows retain production labels and row-specific choices. Confirmed exclusions retain existing scope-rationale requirements; uncertainty is not converted to an exclusion.
