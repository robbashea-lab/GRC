# CIS v8.1 IG1 practical assessment guidance

Research and validation date: 2026-10-02. Base: `76293da2d4fbb12dd872790bf4a1e53e3ff631a7`.

## Content authority and scope

All 56 existing IDs/titles were compared with the safeguard headings and descriptions
on the official [CIS Assessment Specification](https://cas.docs.cisecurity.org/en/latest/)
pages linked by the existing catalog. The live comparison found 56 matches, no title
mismatches. Version/IG1 context was checked against the official
[v8.1 Navigator](https://www.cisecurity.org/controls/cis-controls-navigator) and
[v8.1 publication page](https://www.cisecurity.org/insights/white-papers/cis-critical-security-controls-v8-1).
CAS inputs, metrics and scoring are not imported as IG1 requirements. `latest` URLs
are mutable; this is a dated source review, not a claim that their contents cannot change.

The existing requirement catalog contains concise Omnisciente summaries, not full
verbatim CIS wording. Section 1 now labels those summaries explicitly. Existing
official/licensed-text rendering is retained, with an explicit label, if authorized
text is supplied. No new full-text redistribution is introduced. The prior authorization
record in `cis-substantive-validation.md` is preserved; public accessibility is not
being treated as a commercial license. Official source links open in a separate tab.

New content lives once in `shared/catalogs/operatorGuidance/cisAssessmentGuidance.json`,
version 8.1, revision 2026-10-02. Every safeguard has independent review, evidence and
outcome bullets. Evidence examples are alternatives, including responsible-provider
evidence, not mandatory artifacts. Configuration evidence is distinguished from
execution results. No upload instructions, technology mandates or new completion rules.

## Workbook-to-safeguard coverage

All six supplied workbooks were read, including their comment sheets. The master has
15 grouped instruction rows; the cadence workbooks have 31 instruction rows. Together
they cover exactly the 56 IG1 IDs. No separate walkthrough file was supplied with this
turn; the written request and workbooks supplied the presentation direction.

Abbreviations: M = `CIS Controls v8.1 IG1 Safeguards (3).xlsx` (instruction column E);
A = `Annual (6).xlsx`; W = `Weekly (2).xlsx`; S = `Semi-Annual (2).xlsx`;
Q = `Quarterly (3).xlsx`; Mo = `Monthly (3).xlsx` (instruction column D).
Rows below map reference-writing material, **not authoritative cadence**. Grouped rows
were separated into individual guidance rather than copied wholesale. No workbook
names, completion dates, task states or client records were imported.

| Safeguard IDs (each has its own guidance) | Workbook instruction cells | Official safeguard-description source |
| --- | --- | --- |
| 1.1 | M E2; S D2 | [Control 1](https://cas.docs.cisecurity.org/en/latest/source/Controls1/) |
| 1.2 | M E2; W D3 | [Control 1](https://cas.docs.cisecurity.org/en/latest/source/Controls1/) |
| 2.1 | M E3; S D3 | [Control 2](https://cas.docs.cisecurity.org/en/latest/source/Controls2/) |
| 2.2 | M E3; Mo D6 | [Control 2](https://cas.docs.cisecurity.org/en/latest/source/Controls2/) |
| 2.3 | M E3; Mo D7 | [Control 2](https://cas.docs.cisecurity.org/en/latest/source/Controls2/) |
| 3.1 | M E4; A D3 | [Control 3](https://cas.docs.cisecurity.org/en/latest/source/Controls3/) |
| 3.2 | M E4; A D10 | [Control 3](https://cas.docs.cisecurity.org/en/latest/source/Controls3/) |
| 3.3, 3.4, 3.5, 3.6 | M E4; Q D6 | [Control 3](https://cas.docs.cisecurity.org/en/latest/source/Controls3/) |
| 4.1 | M E5; A D7 | [Control 4](https://cas.docs.cisecurity.org/en/latest/source/Controls4/) |
| 4.2 | M E5; A D8 | [Control 4](https://cas.docs.cisecurity.org/en/latest/source/Controls4/) |
| 4.3, 4.4, 4.5, 4.6, 4.7 | M E5; Q D9 | [Control 4](https://cas.docs.cisecurity.org/en/latest/source/Controls4/) |
| 5.1 | M E6; Q D2 | [Control 5](https://cas.docs.cisecurity.org/en/latest/source/Controls5/) |
| 5.2, 5.4 | M E6; Q D3 | [Control 5](https://cas.docs.cisecurity.org/en/latest/source/Controls5/) |
| 5.3 | M E6; Mo D4 | [Control 5](https://cas.docs.cisecurity.org/en/latest/source/Controls5/) |
| 6.1, 6.2, 6.3, 6.4, 6.5 | M E7; Q D3 | [Control 6](https://cas.docs.cisecurity.org/en/latest/source/Controls6/) |
| 7.1 | M E8; A D12 | [Control 7](https://cas.docs.cisecurity.org/en/latest/source/Controls7/) |
| 7.2 | M E8; Mo D8 | [Control 7](https://cas.docs.cisecurity.org/en/latest/source/Controls7/) |
| 7.3 | M E8; Mo D3 | [Control 7](https://cas.docs.cisecurity.org/en/latest/source/Controls7/) |
| 7.4 | M E8; Mo D2 | [Control 7](https://cas.docs.cisecurity.org/en/latest/source/Controls7/) |
| 8.1 | M E9; A D2 | [Control 8](https://cas.docs.cisecurity.org/en/latest/source/Controls8/) |
| 8.2, 8.3 | M E9; Q D4 | [Control 8](https://cas.docs.cisecurity.org/en/latest/source/Controls8/) |
| 9.1, 9.2 | M E10; Q D5 | [Control 9](https://cas.docs.cisecurity.org/en/latest/source/Controls9/) |
| 10.1, 10.2, 10.3 | M E11; Q D7 | [Control 10](https://cas.docs.cisecurity.org/en/latest/source/Controls10/) |
| 11.1 | M E12; A D4 | [Control 11](https://cas.docs.cisecurity.org/en/latest/source/Controls11/) |
| 11.2 | M E12; W D2 | [Control 11](https://cas.docs.cisecurity.org/en/latest/source/Controls11/) |
| 11.3, 11.4 | M E12; Q D8 | [Control 11](https://cas.docs.cisecurity.org/en/latest/source/Controls11/) |
| 12.1 | M E13; Mo D5 | [Control 12](https://cas.docs.cisecurity.org/en/latest/source/Controls12/) |
| 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8 | M E14; A D9 | [Control 14](https://cas.docs.cisecurity.org/en/latest/source/Controls14/) |
| 15.1 | M E15; A D11 | [Control 15](https://cas.docs.cisecurity.org/en/latest/source/Controls15/) |
| 17.1 | M E16; A D5 | [Control 17](https://cas.docs.cisecurity.org/en/latest/source/Controls17/) |
| 17.2 | M E16; A D6 | [Control 17](https://cas.docs.cisecurity.org/en/latest/source/Controls17/) |
| 17.3 | M E16; A D13 | [Control 17](https://cas.docs.cisecurity.org/en/latest/source/Controls17/) |

Per-safeguard deep-link anchors remain in the unchanged `cisAssessmentCriteria.json`.

## Material corrections and safeguards against overstatement

- 1.1 explicitly includes the complete device scope, required identifying fields and
  six-month interval; 1.2 separately covers weekly unauthorized-asset action.
- 2.1 lists specified software fields and conditional additional details. 2.2 preserves
  the specific necessary-unsupported-software exception conditions; 2.3 preserves its
  documented-exception option. Generic risk acceptance does not waive other safeguards.
- 3.4 covers minimum **and** maximum retention. 4.3 retains 15-minute/2-minute limits.
- 5.1 retains account fields and quarterly authorization validation. 5.2 identifies
  CIS's 8/14-character examples as best-practice examples, not a new scoring rule.
- 5.3 retains 45-day dormancy where supported, not a monthly grace period. 6.2 retains
  immediate revocation; scheduled evidence review cannot delay the operational action.
- 7.3/7.4 require actual automated monthly-or-more-frequent deployment, not a report.
- 8.3 does not import the separate IG2 90-day retention safeguard. 9.1 retains the
  source's latest-version condition; 9.2 explicitly covers remote devices.
- 11.2 distinguishes weekly-or-more-frequent execution from evidence review, with
  data sensitivity affecting frequency. 11.3 protection and 11.4 isolation stay separate.
  An IG2 quarterly restore test is not added to IG1.
- 14.1 includes training at hire and annually, with annual/change-driven content
  maintenance. 14.2–14.8 retain their specific subjects without inventing eight separate
  recurring Reviews. 15.1 inventory is not an IG2 supplier-assessment mandate.
- 17.1 includes lead, backup and internal provider oversight. 17.2 notification contacts
  and 17.3 workforce reporting instructions remain distinct.

No Review templates, cadence configuration, mappings, statuses, assessment calculations,
permissions or backend contracts changed. User-selected evidence-review intervals remain
operational choices. Scope is the first two CIS sections, not SOC 2/ISO content.

## Preservation and verification

The existing shared CIS capability already enables this workspace for every applicable
client. No Brawndo ID/name gate, tenant guidance copy, schema change, reseed or migration
was introduced. The old 85 criterion IDs, saved responses and their immutable assessment
snapshots remain supported by the existing save/API/history paths; reading new guidance
does not change conclusions or create a draft. Old criteria are no longer editable in
this presentation, but remain in data/history.

Focused command (frontend): `CI=true node node_modules/@craco/craco/dist/bin/craco.js test
--watch=false --runInBand --runTestsByPath` with `cisAssessmentGuidance`,
`cisAssessmentCriteria`, `BrawndoCisAssessment`, `FrameworkOperator`,
`assessmentVerification`, `frameworkCapabilityContract`, `PrestigeSocAssessment`:
**7 suites, 141 tests passed**. Includes legacy response/history preservation, read-only
rendering, shared-client behavior, failures/draft retention and SOC non-regression.

`node frontend/scripts/preview.cjs build`: optimized Demo build passed. Existing CRA
bundle-size advisory and Node fs.F_OK deprecation warning remain; no dependency change.

Loopback browser QA using installed Edge/Playwright, disposable session storage,
non-loopback requests blocked:

- `frontend/scripts/qa/cis-criteria.cjs`: all 56 Brawndo IDs/titles/source links and exact
  guidance lists checked; status/verification/narrative saved and reloaded; prior history,
  criteria responses and evidence references retained. Navigation/draft guards and focus
  trap/restoration/Escape passed. Light/dark at 1440/1280/1024/768: no modal overflow;
  screenshots inspected at 1440 and 768. Follow-on targeted pass also created a Finding
  with exactly one Action, uploaded/downloaded/reopened synthetic Evidence and retained
  the originating safeguard. No runtime errors in successful runs.
- `frontend/scripts/qa/cis-guidance-onboarding.cjs`: actual new-client onboarding into
  CIS only; separate ISO-only client subsequently enabled CIS through confirmed program
  configuration. Each had 56 distinct CIS records and identical guidance; save/next,
  previous, reload and history passed. Other clients and ISO assessment records unchanged.

The older broad `evidence-library.cjs` harness could not start because it assumes an
Initech canonical seed that current main no longer supplies. It was not changed or
reported as passing; the affected CIS Finding/Evidence path was tested directly instead.
Initial new-test failures involved overstrict content heuristics and obsolete UI selectors;
corrected tests exercise current observable behavior rather than changing product rules.

These are static Demo/UI and existing mocked API checks, not new persistent-backend,
authentication, certification or whole-application assurance. Synthetic QA state is never
included in the published archive. Publication identifiers are reported in the release handoff.
