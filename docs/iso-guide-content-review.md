# ISO guide content review

Reviewed 2026-10-02. Catalog version 1 targets ISO/IEC 27001:2022 with Amendment 1:2024.

## Coverage and schema

The shared catalog contains 123 entries keyed by the exact IDs in `shared/catalogs/iso27001.json`: 30 assessable clause units and all 93 Annex A reference controls (37 organizational, 8 people, 14 physical, 34 technological). This is product assessment granularity, not a claim that ISO defines 30 independent clauses.

Each entry includes `title`, `author`, `content_label`, and five string answers: `plain`, `start`, `evidence`, `ask`, `gaps`. The `review`, `evidence_examples`, and `outcome` arrays support structured consumers. `evidence_examples` avoids changing the five-answer `evidence` string contract.

Plain-language explanations and initial evidence suggestions reuse the existing Omnisciente-authored `frontend/src/lib/operatorGuidance/iso.json` and approved framework catalog. Starting checks, interview questions and gap examples were reviewed individually for the relevant ID. They do not claim to exhaust the standard's requirements. Review prompts identify an observable sample or decision; each outcome is a specific positive description of demonstrated implementation.

The content review removed assumptions that every organization has customer, regulator and workforce requirements of equal relevance, a named register or matrix, an excluded scope boundary, a completed incident, outsourced development or a particular technical deployment. Examples are conditioned on relevant scope, selected Annex A applicability and actual operations. Evidence arrays provide an additional record-specific way to substantiate each topic; they are suggestions, not prescribed document packages. Named documents can be represented through existing authoritative modules where their content and control are sufficient. Repeated weakness-follow-up boilerplate was removed from outcomes; gap examples remain in the dedicated gaps answer.

Each interview answer now identifies the relevant people by responsibility before its tailored question. Responsibilities are not required job titles or contact-model fields; independent clients can use their own assignments. Governance questions point to client leadership or ISMS owners, personnel questions to personnel or line-management responsibilities, and physical questions to facilities or asset owners. Provider involvement is expressly conditional on the assessed activity being outsourced and does not imply an MSP owns governance, HR or facilities accountability.

## Primary sources checked

- [ISO/IEC 27001:2022](https://www.iso.org/standard/27001): confirmed the published third edition and amendment link. The public description supports the ISMS and risk-management context; it does not expose the full normative requirements.
- [ISO/IEC 27002:2022](https://www.iso.org/standard/75652.html): confirmed the identity of the companion control-guidance standard. Public metadata does not substantiate each detailed implementation suggestion.
- [ISO/IEC 27001:2022/Amd 1:2024](https://www.iso.org/standard/88435.html): confirmed the climate-action amendment reference.
- [Joint ISO/IAF communication, February 2024](https://www.iso.org/files/live/sites/isoorg/files/standards/popular_standards/management_systems/ISO-IAF%20Joint%20Communique%20Feb%202024.pdf): supports consideration of climate relevance in context and relevant interested-party requirements.

Public sources were accessed legitimately. No full licensed copy was supplied or reviewed; no copyrighted normative clause paragraphs or control implementation text were copied. ISO's public pages are edition/source checks, not evidence that this catalog has received an independent clause-by-clause standards review. IDs, authored titles and grouping remain aligned with the approved product catalog. All explanations, questions and examples are explicitly labeled Omnisciente guidance.

## Amendment and interpretation caveats

Entries 4.1 and 4.2 preserve the approved catalog's amendment context. Determine whether climate change is relevant to the ISMS and consider relevant interested-party requirements; this does not automatically require every organization to adopt environmental objectives or a particular climate programme. The amendment context does not renumber Annex A or create another control set.

Clause requirements are assessed within the management-system scope. Annex A applicability remains a risk-based SoA decision. A justified Not Necessary decision is distinct from an implemented control; necessary controls can exist outside Annex A. These prompts neither decide applicability nor replace treatment-owner acceptance.

No generic annual or quarterly cadence is introduced. Planned activity and exact operating interval must remain distinct, with the authoritative Review cadence source preserved. An audit, management review, independent security evaluation and operational control review retain their different purposes.

Evidence examples are suggestions, not a mandatory document list. Personnel records, credentials, keys, incident artifacts and live-derived test data require appropriate access and minimization; do not upload secrets to satisfy an example. A policy, purchased tool, completed task or collected evidence alone does not prove effective implementation.

## Validation

A runnable Node check below validates exact ID coverage, group counts, nonempty five-answer content and structured arrays without adding a dependency:

```powershell
node -e "const fs=require('fs'); const assert=require('assert/strict'); const base=JSON.parse(fs.readFileSync('shared/catalogs/iso27001.json','utf8')); const guide=JSON.parse(fs.readFileSync('shared/catalogs/operatorGuidance/isoRequirementGuide.json','utf8')); const ids=base.requirements.map(r=>r.id); assert.equal(new Set(ids).size,123); assert.deepEqual(Object.keys(guide.entries).sort(),ids.slice().sort()); assert.equal(ids.filter(id=>!id.startsWith('A.')).length,30); for(const [group,count] of [['A.5.',37],['A.6.',8],['A.7.',14],['A.8.',34]]) assert.equal(ids.filter(id=>id.startsWith(group)).length,count); for(const entry of Object.values(guide.entries)){ for(const field of ['plain','start','evidence','ask','gaps']) assert.equal(typeof entry[field],'string'); for(const field of ['plain','start','evidence','ask','gaps']) assert.ok(entry[field].trim()); for(const field of ['review','evidence_examples','outcome']) assert.ok(Array.isArray(entry[field]) && entry[field].length && entry[field].every(value=>typeof value==='string' && value.trim())); assert.equal(entry.author,'Omnisciente'); } console.log('123 guides verified: 30 clauses and 93 Annex A controls');"
```

This check establishes catalog integrity, not normative conformity, certification readiness or browser behavior. Independent ISO subject-matter review against an authorized copy remains a release assurance step if normative completeness is claimed.
