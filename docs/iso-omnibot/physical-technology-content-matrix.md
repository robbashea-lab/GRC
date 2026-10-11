# ISO OmniBot physical and technology interview content

Content revision: `iso27001-omni-1`. Framework: `iso-27001`.
Public-source access and authored content review: 2026-10-11.
Scope: exactly 48 native Annex A IDs, A.7.1–A.7.14 and A.8.1–A.8.34.
Catalog: `shared/catalogs/guidedIsoPhysicalTechnology.json`.

These are original practical interviews, not reproduced ISO normative text. Titles and
specifications match the native catalog. The 48-definition inventory is complete for
this assignment; full normative requirement decomposition and completeness are **not
verified**. The existing pending criteria and licensed-source limitations remain intact.

## Source ledger and bounded coverage

| ID | Source and accessed section | Authority and bounded use |
| --- | --- | --- |
| I1 | [ISO/IEC 27001 publication record](https://www.iso.org/standard/27001), edition/lifecycle/amendment metadata | Primary publication metadata: 2022, edition 3, published, with Amd 1:2024 listed. Does not expose full Annex A. |
| I2 | [ISO/IEC 27001:2022/Amd 1:2024 record](https://www.iso.org/standard/88435.html), amendment identity | Primary amendment metadata. Supports represented version, not extra physical/technology obligations. |
| I3 | [ISO/IAF joint communiqué](https://iaf.nu/iaf_system/uploads/documents/Joint_ISO-IAF_Communique_re_Climate_Change_Amds_to_ISO_MSS_Feb_2024_Final.pdf), pp. 1–3 | Primary public communication: climate context in 4.1/4.2. No blanket climate-control programme or changed Annex A checklist is inferred. |
| I4 | [SIST official ISO/IEC 27002:2022 public preview](https://preview.sist.si/sist-preview/75652/f9b90f856c0d4c3dbef74cf67374d1c5/ISO-IEC-27002-2022.pdf), corrected 2022-03, printed contents p. iv | Publisher preview corroborates the 14 physical and 34 technological control-topic IDs. The 15-page preview does **not** include substantive sections 7/8. Contents headings are not full control verification. The redline preview was not used. |
| I5 | [SIST official ISO/IEC 27001:2022 public preview](https://preview.sist.si/sist-preview/82875/726bcf58250e43d9a666b4d929c8fbdb/ISO-IEC-27001-2022.pdf), 6.1.3, printed pp. 4–5 | Primary public base-standard excerpt supports necessary-control selection, Annex comparison and separate SoA decisions. Its 11 pages do **not** expose Annex A. No full standard was downloaded or redistributed. |
| I6 | [ISO/IEC 27002 publication record](https://www.iso.org/standard/75652.html), edition/corrected version and 27001 relationship | Primary metadata and public explanation: 27002 supports implementation; its guidance is not automatically another mandatory 27001 requirement. |
| R | `shared/catalogs/iso27001.json` and `shared/catalogs/operatorGuidance/isoRequirementGuide.json`, matched native ID and fields cited below | Existing original repository guidance: title/specification, purpose, practical inquiry and evidence examples. Reused as authored guidance, not a licensed-text authority. `R:A.7.1`, for example, means that entry's cited fields. |
| N53 | [NIST SP 800-53 Rev. 5 public final PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-53r5.pdf), Chapter 3 controls/discussions cited per question | Primary public security practice used to corroborate selected implementation dimensions. This content uses the Rev. 5 final PDF including 2020 updates. [NIST metadata](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final) also lists release 5.2.0; this is a pinned supporting reference, not an assertion that the older PDF is the latest catalog. Links here are author-selected topic references, not an official ISO/NIST equivalence crosswalk. |
| N88 | [NIST SP 800-88 Rev. 2 public final PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-88r2.pdf), 4.3 and 4.5 | Primary sanitization practice: method selection, verification and validation. Supports removal-result probes; does not turn one technique or certificate into an ISO obligation. |
| N218 | [NIST SP 800-218, SSDF 1.1 public final PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf), PO.1, PO.4, PW.1, PW.5, PW.7, PW.8 | Primary software-development recommendations supporting the author-selected practical questions. Not ISO normative authority; task examples and tools are alternatives, not additional mandatory requirements. |

Repository files inspected before authoring also include
`operatorGuidance/isoAssessmentCriteria.json`, `docs/iso-assessment-criteria.md`,
`docs/iso-substantive-validation.md`, `docs/iso-assessment-source-inputs.md`,
`docs/iso27001-research.md`, `docs/framework-source-manifest.md` and
`docs/framework-public-source-baseline.md`. All 48 assigned existing criteria entries
are pending/empty. Those files were not changed. The interviews reuse the SOC catalog's
definitions/groups/questions structure, not its criterion semantics or content.

## Interpretation and engine contract

- Whole-control inclusion/exclusion remains the native SoA decision. No implementation
  choice is whole-control N/A, and no interview condition changes that decision.
- **M** means a mandatory ISO obligation established by accessed normative text.
  There are no M question rows here: Annex A text was unavailable. The separately
  accessed 6.1.3 selection/comparison/SoA obligation is mandatory but outside these
  implementation questions.
- **G** means an unconditional authored implementation-guidance probe for a control
  selected through the SoA. It has the normal Yes/Partially/No/Not sure choices.
  It is substantive reported implementation input, not a newly verified ISO obligation.
- **X** means an unscored context question about one actual subpart. Its choices are
  Relevant/Not relevant here/Not sure. The engine must require a reason for Not relevant
  here. Not sure stays unresolved; it must not imply irrelevance or successful completion.
- **C-G** means authored implementation guidance shown only when its named context
  question equals Relevant. The dependency is local to the same definition. Every
  affected definition still has unconditional G questions.
- **O** means an optional text note. Empty, unknown tool names or unknown owner names
  must not affect status. No required tool/owner-name identification questions are used.
- **W / working_interpretation** is the content-confidence value for every question and
  definition: topic identity is publicly corroborated; exact licensed control obligations,
  qualifications and completeness require legitimate full-source comparison.
- Question `source_refs` identifies R/I4 and the cited practice sections where useful.
  Definition `source_refs` also records version metadata. I4 is **topic identity only**
  on every row, never evidence that the absent 27002 guidance was read.
- Tools, techniques, evidence forms and role arrangements in help are nonexclusive
  alternatives. There are no required vendor names, fixed operating cadences or
  prescribed policy titles. Follow the organization's actual risks and obligations.
- Reported answers do not verify evidence, certify conformity or automatically change
  native applicability, assessment, Finding, Action, Review or audit conclusions.
  Engine behavior, aggregation, persistence and UI are owned by the main agent.

## Control coverage

48 definitions, 160 groups and 186 questions:
181 select, 4 context and
1 optional text. Group/question identifiers use the stable
`ISO-A.7.n-` / `ISO-A.8.n-` namespace; native definition keys retain `A.7.n` / `A.8.n`.

| Native ID | Native title | Groups | Select | Context | Optional text |
| --- | --- | ---: | ---: | ---: | ---: |
| A.7.1 | Protected site boundaries | 3 | 3 | 0 | 0 |
| A.7.2 | Controlled site entry | 4 | 5 | 1 | 0 |
| A.7.3 | Protected facilities | 3 | 4 | 0 | 0 |
| A.7.4 | Physical intrusion monitoring | 3 | 3 | 0 | 0 |
| A.7.5 | Environmental hazard protection | 3 | 3 | 0 | 0 |
| A.7.6 | Secure-area working practices | 3 | 3 | 0 | 0 |
| A.7.7 | Clear desks and screens | 3 | 3 | 0 | 0 |
| A.7.8 | Protected equipment placement | 3 | 3 | 0 | 0 |
| A.7.9 | Off-site asset safeguards | 3 | 3 | 0 | 0 |
| A.7.10 | Media lifecycle safeguards | 4 | 4 | 0 | 0 |
| A.7.11 | Utility resilience | 3 | 3 | 0 | 0 |
| A.7.12 | Protected cabling | 3 | 3 | 0 | 0 |
| A.7.13 | Equipment servicing | 4 | 5 | 1 | 0 |
| A.7.14 | Equipment retirement and reuse | 3 | 4 | 0 | 0 |
| A.8.1 | Endpoint safeguards | 3 | 3 | 0 | 0 |
| A.8.2 | Privileged permissions | 3 | 4 | 0 | 0 |
| A.8.3 | Restricted information access | 3 | 4 | 0 | 0 |
| A.8.4 | Source-code access | 4 | 4 | 0 | 0 |
| A.8.5 | Authentication safeguards | 3 | 4 | 0 | 0 |
| A.8.6 | Capacity planning | 3 | 3 | 0 | 0 |
| A.8.7 | Malware defences | 4 | 4 | 0 | 0 |
| A.8.8 | Vulnerability handling | 4 | 4 | 0 | 0 |
| A.8.9 | Secure configuration | 3 | 4 | 0 | 0 |
| A.8.10 | Information deletion | 3 | 4 | 0 | 0 |
| A.8.11 | Data masking | 3 | 4 | 0 | 0 |
| A.8.12 | Data-loss prevention | 3 | 4 | 0 | 0 |
| A.8.13 | Recoverable backups | 4 | 4 | 0 | 0 |
| A.8.14 | Processing redundancy | 3 | 3 | 0 | 0 |
| A.8.15 | Security event logs | 3 | 5 | 0 | 0 |
| A.8.16 | Activity monitoring | 4 | 4 | 0 | 0 |
| A.8.17 | Aligned system clocks | 3 | 3 | 0 | 0 |
| A.8.18 | Privileged utility use | 3 | 4 | 0 | 0 |
| A.8.19 | Software installation controls | 3 | 4 | 0 | 0 |
| A.8.20 | Network protection | 4 | 4 | 0 | 0 |
| A.8.21 | Network-service safeguards | 3 | 4 | 0 | 0 |
| A.8.22 | Network segmentation | 3 | 3 | 0 | 0 |
| A.8.23 | Web-content controls | 3 | 4 | 0 | 0 |
| A.8.24 | Cryptographic safeguards | 4 | 4 | 0 | 1 |
| A.8.25 | Secure development lifecycle | 3 | 3 | 0 | 0 |
| A.8.26 | Application security needs | 3 | 4 | 0 | 0 |
| A.8.27 | Secure architecture principles | 3 | 3 | 0 | 0 |
| A.8.28 | Secure coding practices | 3 | 4 | 0 | 0 |
| A.8.29 | Security testing before acceptance | 4 | 4 | 0 | 0 |
| A.8.30 | Outsourced development oversight | 4 | 4 | 0 | 0 |
| A.8.31 | Separated development and production | 4 | 4 | 0 | 0 |
| A.8.32 | Controlled changes | 4 | 5 | 1 | 0 |
| A.8.33 | Protected test information | 4 | 4 | 1 | 0 |
| A.8.34 | Safe audit testing | 4 | 5 | 0 | 0 |

## Per-definition assurance disposition

Targeted closeout at `3193e564899473fddea0eabd7356fbb643d5fe1b`, 2026-10-11,
reuses the [completed independent review and remediation](independent-content-review.md).
Use the single [shared source boundary and evaluator/classification legend](isms-content-matrix.md#shared-assurance-source-boundary):
**B2 A.x.y** identifies the exact 27001 Annex A statement and corresponding
27002 implementation section, not a claim of accessed control bodies. Existing
`U:A.x.y` entries below supply detailed comparison context. Official topic
contents and related primary NIST practice support original practical dimensions,
not ISO normative equivalence or full substantive completeness.

Counts: **48 definitions; S 0 / U 48; N 41 / O? 3 / E? 4; confirmed defects 0**.
O?/E? name comparison priorities, not demonstrated violations. In particular,
E? flags a separately scored supporting practice that may be an implementation
option rather than an independent required obligation; compare before deciding.
**R applies to every row**, including original guidance selects. N does not close
an unresolved source gap. Suffixes resolve to `ISO-<ID>-<suffix>` below. No catalog,
question meaning/version, evaluator or deployed data is changed by these notes.

| Native ID | Represented substantive dimensions / qualifiers | Support / exact target | Class | Specific comparison or disposition | Evaluator effects beyond R |
| --- | --- | --- | --- | --- | --- |
| A.7.1 | Appropriate site boundary/perimeter, access limits and actual effectiveness | U; B2 A.7.1 | N | Verify perimeter design/strength and implementation qualifications; provider premises may remain relevant. | R only |
| A.7.2 | Authorized entry, visitor handling and effective controls; relevant delivery access | U; B2 A.7.2 | N | Verify entry/access-point/visitor and delivery-route scope; no compulsory badge/guard arrangement. | C `delivery-context` |
| A.7.3 | Facilities protection for actual use, access and unattended exposure | U; B2 A.7.3 | N | Verify facility design/application/protection qualifiers; visibility and unattended probes are authored practice. | R only |
| A.7.4 | Monitoring coverage, working detection and response | U; B2 A.7.4 | O? | `detection` says when protection is needed; verify exact continuity/coverage qualification. PE-6/topic identity does not settle that wording. | R; qualified operating detection `Yes` does not independently establish continuous coverage |
| A.7.5 | Relevant physical/environmental threats, safeguards and functioning protection | U; B2 A.7.5 | N | Verify natural/deliberate/other threat subjects and protection qualifications; no equipment bundle inferred. | R only |
| A.7.6 | Defined understood applied secure-area work precautions | U; B2 A.7.6 | N | Verify secure-area activity/personnel qualifiers; recording restrictions are risk-based, not a universal ban. | R only |
| A.7.7 | Appropriate desk/media and screen protection, rules and applied practice | U; B2 A.7.7 | N | Verify paper/media/screen subjects and policy qualification; no fixed lock timeout. | R only |
| A.7.8 | Equipment placement/protection against access and environmental exposure | U; B2 A.7.8 | N | Verify siting and protection qualifiers including confidentiality; no universal locked-room design. | R only |
| A.7.9 | Accountable offsite custody/handling and loss/compromise response readiness | U; B2 A.7.9 | E? | Compare `loss` reporting/containment readiness: independent control duty or one supporting offsite-protection practice? Do not infer a remote-wipe mandate. | R; `loss=No` yields `needs_attention` despite affirmative custody/handling |
| A.7.10 | Media acquisition/use/transport/disposal and classification-based protection | U; B2 A.7.10 | N | Verify full media lifecycle and classification qualifiers; technique choice is local. | R only |
| A.7.11 | Utility needs, interruption protection and usable resilience | U; B2 A.7.11 | N | Verify supporting-utility disruption/maintenance qualifiers; no generator/runtime/test interval inferred. | R only |
| A.7.12 | Power/data cable risks and applied protection | U; B2 A.7.12 | N | Verify interception/interference/damage scope and cable subjects; no universal conduit design. | R only |
| A.7.13 | Suitable maintenance and service access/information safeguards | U; B2 A.7.13 | N | Verify maintenance objectives/authorized-service qualifiers; offsite release is only a conditional subpart. | C `offsite-context` |
| A.7.14 | Identify retained data/software, appropriate removal/protection and checked retirement/reuse | U; B2 A.7.14 | N | Verify sensitive-data/licensed-software checking/removal qualifiers; NIST sanitization options do not mandate a certificate/method. | R only |
| A.8.1 | Relevant endpoint rules/protection and maintained operation | U; B2 A.8.1 | N | Verify storage/processing/access scope and protection qualifiers; no required MDM/antivirus product. | R only |
| A.8.2 | Identify, authorize/restrict, review and manage privileged access | U; B2 A.8.2 | N | Verify allocation/use restrictions and oversight qualifiers; no compulsory privileged-access suite. | R only |
| A.8.3 | Suitable information access needs, restrictions and enforcement | U; B2 A.8.3 | N | Verify access-rule relationship and restriction/exception scope; an entitlement list alone is not enforcement. | R only |
| A.8.4 | Controlled authorized source/development access, changes and protection | U; B2 A.8.4 | N | Verify read/write scope across code, development tools and libraries; hosted tooling is not exemption. | R only |
| A.8.5 | Authentication appropriate to restrictions, credential protection and operation | U; B2 A.8.5 | N | Verify procedure/technology/access-restriction qualifiers; no universal MFA/SSO factor/product obligation. | R only |
| A.8.6 | Current/future capacity needs, monitoring and suitable response | U; B2 A.8.6 | N | Verify expected-use projection and adjustment qualifiers; thresholds/forecast format remain local. | R only |
| A.8.7 | Relevant malware prevention/detection/response, awareness and maintenance | U; B2 A.8.7 | N | Verify protection/user-awareness subjects and qualifiers; no universal agent or course cadence. | R only |
| A.8.8 | Vulnerability information, exposure/risk evaluation and treatment | U; B2 A.8.8 | N | Verify information/evaluation/action and timing qualifiers; no scanner/patch deadline inferred. | R only |
| A.8.9 | Suitable configuration baselines, applied settings, change control and review | U; B2 A.8.9 | N | Verify establishing/documenting/implementing/monitoring/reviewing dimensions and subjects; no mandatory benchmark. | R only |
| A.8.10 | Deletion decisions, actual removal and result handling across copies/providers | U; B2 A.8.10 | N | Verify no-longer-required/retention qualification and system/media scope; backups depend on actual retention design. | R only |
| A.8.11 | Protection needs, suitable masking/access/use and re-identification risks | U; B2 A.8.11 | N | Verify access-rule/policy/business/legal qualifiers; a masking technique is not universally required for every field. | R only |
| A.8.12 | Relevant leakage paths/information, prevention and effective operation/response | U; B2 A.8.12 | N | Verify system/network/device scope and prevention qualifications; marketed DLP software is not the duty. | R only |
| A.8.13 | Backup coverage, protection, appropriate schedules and recovery checks | U; B2 A.8.13 | N | Verify information/software/system scope, policy and maintenance/testing qualifiers; no daily/restore interval inferred. | R; F2 notes retained separately and unscored |
| A.8.14 | Availability needs, sufficient redundancy and actual resilience | U; B2 A.8.14 | N | Verify sufficiency/availability qualifications; no active-active topology or failover target imposed. | R only |
| A.8.15 | Relevant log events/generation, storage/protection and usable analysis | U; B2 A.8.15 | N | Verify production/storage/protection/analysis subjects and qualifications; retention/field design is local. | R only |
| A.8.16 | Meaningful activity monitoring, anomaly detection and evaluation/response | U; B2 A.8.16 | N | Verify network/system/application and anomalous-behavior/action scope; no universal continuous human watch. | R only |
| A.8.17 | Suitable time references, synchronization and problem handling | U; B2 A.8.17 | N | Verify approved-source/relevant-system qualifiers; no mandated protocol/tolerance/observation interval. | R only |
| A.8.18 | Powerful utility scope, restricted/authorized use and traceable significant activity | U; B2 A.8.18 | E? | Compare `accountability` tracing/examination as independent obligation versus supporting restricted-use technique; alternatives include supervised work, not just logs. | R; `accountability=No` yields `needs_attention` despite affirmative restrictions |
| A.8.19 | Installation rules/permissions, secure procedures and failed/unauthorized outcome handling | U; B2 A.8.19 | E? | Compare `outcome` failure-handling as separate required criterion versus supporting secure-installation practice; no package-manager mandate. | R; `outcome=No` yields `needs_attention` despite affirmative rules/procedure |
| A.8.20 | Appropriate network/device boundaries, management and protective operation | U; B2 A.8.20 | N | Verify network/device control and information/application protection qualifications; no prescribed firewall topology. | R only |
| A.8.21 | Network-service needs, agreed security/delivery and actual oversight | U; B2 A.8.21 | N | Verify security mechanisms, service levels and service-management/delivery qualifiers; no universal SLA. | R only |
| A.8.22 | Appropriate segmentation and enforced group boundaries | U; B2 A.8.22 | N | Verify information-service/user/system segregation subjects; logical/physical design alternatives remain local. | R only |
| A.8.23 | External-content risks, suitable access management and handled exceptions | U; B2 A.8.23 | N | Verify website-access purpose/qualification; categories and filtering methods are local choices. | R only |
| A.8.24 | Effective suitable cryptographic use and key management | U; B2 A.8.24 | N | Verify rules/key lifecycle/protection qualifiers; no algorithm, vendor or key-rotation interval inferred. | O `arrangement-note` |
| A.8.25 | Security rules and actual software/system development lifecycle application | U; B2 A.8.25 | N | Verify development/lifecycle scope and application qualifications; SSDF is related practice, not ISO authority. | R only |
| A.8.26 | Application needs identification/agreement, acceptance usefulness and change review | U; B2 A.8.26 | O? | `agreement` asks agreed requirements; verify exact specification/approval formality for development/acquisition rather than equating agreement with approval. | R; agreement `Yes` need not prove formal approval |
| A.8.27 | Established principles, actual design application and material-change review | U; B2 A.8.27 | O? | Verify exact documentation/maintenance of engineering principles; establishment/application alone may not establish those distinct dimensions. | R; affirmative principles/application do not prove documented maintenance |
| A.8.28 | Appropriate coding rules/use, review and defect correction | U; B2 A.8.28 | N | Verify secure-coding application scope/qualification; SSDF techniques are supplemental options. | R only |
| A.8.29 | Relevant testing plans/execution/results and informed acceptance | U; B2 A.8.29 | N | Verify process definition/implementation across development/acceptance; no mandatory test count or technique. | R only |
| A.8.30 | Directed/monitored/reviewed external development and suitable acceptance | U; B2 A.8.30 | N | Verify exact oversight qualifications; contracts/acceptance are practical probes, not supplier certification mandates. | R only |
| A.8.31 | Development/test/production separation, access/change protection and operation | U; B2 A.8.31 | N | Verify separation/protection subjects and qualifiers; no universal physical/account topology. | R only |
| A.8.32 | Change impact, authorization, implementation checks and relevant urgent routing | U; B2 A.8.32 | N | Verify processing-facility/system change duties; urgent routing is a conditional supporting subpart. | C `urgent-context` |
| A.8.33 | Appropriate test-data selection/protection/handling and live-derived safeguards | U; B2 A.8.33 | N | Verify test-information management qualifiers; use of live-derived data is optional context, not a mandated source. | C `live-context` |
| A.8.34 | Agreed audit scope/access, safe execution, oversight and appropriate closure | U; B2 A.8.34 | E? | Compare `closure` access/copy cleanup as separate control duty versus supporting agreed-test/access practice; exact planning/agreement qualification remains open. | R; `closure=No` yields `needs_attention` despite affirmative scope/safeguards |

## Source-to-question matrix

Each row names its stable question ID and exact reference sections or repository fields.
I4 contents p. iv corroborates the matched topic on every row. Practice references support
original inquiry only; source references do not establish cross-framework equivalence.
The final column points to the per-control licensed-source uncertainty ledger below.

| Question ID | Substantive dimension | Source / section | Distinction / condition | Confidence | Unresolved exact licensed requirements |
| --- | --- | --- | --- | --- | --- |
| ISO-A.7.1-boundary | Protected-area definition | R A.7.1; I4 contents iv; N53 PE-3; R plain/start/outcome | G: core authored guidance; SoA separate | W | U:A.7.1 |
| ISO-A.7.1-barriers | Boundary resistance | R A.7.1; I4 contents iv; N53 PE-3; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.7.1 |
| ISO-A.7.1-condition | Boundary upkeep | R A.7.1; I4 contents iv; N53 PE-3; R review/outcome | G: core authored guidance; SoA separate | W | U:A.7.1 |
| ISO-A.7.2-authorization | Physical entry permissions | R A.7.2; I4 contents iv; N53 PE-2; R plain/outcome | G: core authored guidance; SoA separate | W | U:A.7.2 |
| ISO-A.7.2-revocation | Removal of entry rights | R A.7.2; I4 contents iv; N53 PE-2; R start/ask | G: core authored guidance; SoA separate | W | U:A.7.2 |
| ISO-A.7.2-entry | Entry enforcement | R A.7.2; I4 contents iv; N53 PE-3; R gaps/outcome | G: core authored guidance; SoA separate | W | U:A.7.2 |
| ISO-A.7.2-visitors | Controlled visitor access | R A.7.2; I4 contents iv; N53 PE-3; R start/review | G: core authored guidance; SoA separate | W | U:A.7.2 |
| ISO-A.7.2-delivery-context | Delivery-route context | R A.7.2; I4 contents iv; N53 PE-16; R plain | X: context only; reason required for irrelevance | W | U:A.7.2 |
| ISO-A.7.2-deliveries | Delivery-route protection | R A.7.2; I4 contents iv; N53 PE-16; R plain | C-G: ISO-A.7.2-delivery-context = Relevant | W | U:A.7.2 |
| ISO-A.7.3-needs | Facility protection needs | R A.7.3; I4 contents iv; N53 PE-3; R plain/start | G: core authored guidance; SoA separate | W | U:A.7.3 |
| ISO-A.7.3-safeguards | Protected rooms and facilities | R A.7.3; I4 contents iv; N53 PE-3; R evidence/outcome | G: core authored guidance; SoA separate | W | U:A.7.3 |
| ISO-A.7.3-unattended | Unattended facility protection | R A.7.3; I4 contents iv; N53 PE-3; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.7.3 |
| ISO-A.7.3-visibility | Unintended physical observation | R A.7.3; I4 contents iv; N53 PE-5; R plain | G: core authored guidance; SoA separate | W | U:A.7.3 |
| ISO-A.7.4-coverage | Physical monitoring coverage | R A.7.4; I4 contents iv; N53 PE-6; R plain/gaps | G: core authored guidance; SoA separate | W | U:A.7.4 |
| ISO-A.7.4-detection | Working intrusion detection | R A.7.4; I4 contents iv; N53 PE-6; R start/evidence | G: core authored guidance; SoA separate | W | U:A.7.4 |
| ISO-A.7.4-response | Physical alert response | R A.7.4; I4 contents iv; N53 PE-6; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.7.4 |
| ISO-A.7.5-exposure | Physical and environmental exposure | R A.7.5; I4 contents iv; N53 PE-18; R plain/start | G: core authored guidance; SoA separate | W | U:A.7.5 |
| ISO-A.7.5-protection | Protection against identified hazards | R A.7.5; I4 contents iv; N53 PE-13, PE-14, PE-15; R evidence/outcome | G: core authored guidance; SoA separate | W | U:A.7.5 |
| ISO-A.7.5-readiness | Working hazard protection | R A.7.5; I4 contents iv; N53 PE-13, PE-14, PE-15; R review/gaps | G: core authored guidance; SoA separate | W | U:A.7.5 |
| ISO-A.7.6-rules | Secure-area work rules | R A.7.6; I4 contents iv; N53 PE-3; R plain/start | G: core authored guidance; SoA separate | W | U:A.7.6 |
| ISO-A.7.6-activity | Authorized secure-area activity | R A.7.6; I4 contents iv; N53 PE-3; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.7.6 |
| ISO-A.7.6-recording | Information capture in secure areas | R A.7.6; I4 contents iv; N53 PE-3; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.7.6 |
| ISO-A.7.7-expectations | Clear workspace expectations | R A.7.7; I4 contents iv; N53 AC-11, MP-4; R plain/review | G: core authored guidance; SoA separate | W | U:A.7.7 |
| ISO-A.7.7-materials | Unattended paper and media | R A.7.7; I4 contents iv; N53 MP-4; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.7.7 |
| ISO-A.7.7-screens | Unattended screen protection | R A.7.7; I4 contents iv; N53 AC-11; R start/gaps | G: core authored guidance; SoA separate | W | U:A.7.7 |
| ISO-A.7.8-siting | Equipment siting | R A.7.8; I4 contents iv; N53 PE-18; R plain/start | G: core authored guidance; SoA separate | W | U:A.7.8 |
| ISO-A.7.8-exposure | Equipment access and visibility | R A.7.8; I4 contents iv; N53 PE-3, PE-5; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.7.8 |
| ISO-A.7.8-condition | Continuing equipment protection | R A.7.8; I4 contents iv; N53 PE-18; R review/outcome | G: core authored guidance; SoA separate | W | U:A.7.8 |
| ISO-A.7.9-custody | Authorized off-site custody | R A.7.9; I4 contents iv; N53 PE-16, MP-5; R start/outcome | G: core authored guidance; SoA separate | W | U:A.7.9 |
| ISO-A.7.9-handling | Off-site asset protection | R A.7.9; I4 contents iv; N53 MP-5, AC-19; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.7.9 |
| ISO-A.7.9-loss | Off-site loss handling | R A.7.9; I4 contents iv; N53 AC-19, IR-4; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.7.9 |
| ISO-A.7.10-handling | Media sensitivity and handling | R A.7.10; I4 contents iv; N53 MP-2, MP-7; R plain/ask | G: core authored guidance; SoA separate | W | U:A.7.10 |
| ISO-A.7.10-storage | Media use and storage protection | R A.7.10; I4 contents iv; N53 MP-2, MP-4; R evidence/outcome | G: core authored guidance; SoA separate | W | U:A.7.10 |
| ISO-A.7.10-movement | Protected media transfer | R A.7.10; I4 contents iv; N53 MP-5; R start/gaps | G: core authored guidance; SoA separate | W | U:A.7.10 |
| ISO-A.7.10-retirement | Media sanitization | R A.7.10; I4 contents iv; N53 MP-6; R plain/review; N88 4.3,4.5 | G: core authored guidance; SoA separate | W | U:A.7.10 |
| ISO-A.7.11-dependencies | Supporting utility needs | R A.7.11; I4 contents iv; N53 PE-9, PE-11, PE-14; R plain/start | G: core authored guidance; SoA separate | W | U:A.7.11 |
| ISO-A.7.11-resilience | Protection from utility disruption | R A.7.11; I4 contents iv; N53 PE-11; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.7.11 |
| ISO-A.7.11-readiness | Utility protection readiness | R A.7.11; I4 contents iv; N53 PE-11, PE-14; R review/gaps | G: core authored guidance; SoA separate | W | U:A.7.11 |
| ISO-A.7.12-routes | Cabling exposure | R A.7.12; I4 contents iv; N53 PE-4, PE-9; R plain/start | G: core authored guidance; SoA separate | W | U:A.7.12 |
| ISO-A.7.12-damage | Cabling integrity and availability | R A.7.12; I4 contents iv; N53 PE-4, PE-9; R evidence/outcome | G: core authored guidance; SoA separate | W | U:A.7.12 |
| ISO-A.7.12-access | Cabling access protection | R A.7.12; I4 contents iv; N53 PE-4; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.7.12 |
| ISO-A.7.13-maintenance | Equipment maintenance coverage | R A.7.13; I4 contents iv; N53 MA-2; R plain/start | G: core authored guidance; SoA separate | W | U:A.7.13 |
| ISO-A.7.13-access | Authorized maintenance activity | R A.7.13; I4 contents iv; N53 MA-2, MA-4; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.7.13 |
| ISO-A.7.13-information | Maintenance information protection | R A.7.13; I4 contents iv; N53 MA-2; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.7.13 |
| ISO-A.7.13-offsite-context | Off-site servicing context | R A.7.13; I4 contents iv; N53 MA-2; R plain | X: context only; reason required for irrelevance | W | U:A.7.13 |
| ISO-A.7.13-offsite | Off-site service release | R A.7.13; I4 contents iv; N53 MA-2; R ask | C-G: ISO-A.7.13-offsite-context = Relevant | W | U:A.7.13 |
| ISO-A.7.13-return | Post-maintenance safeguards | R A.7.13; I4 contents iv; N53 MA-2; R outcome | G: core authored guidance; SoA separate | W | U:A.7.13 |
| ISO-A.7.14-review | Information and software before release | R A.7.14; I4 contents iv; N53 MP-6; R plain/start | G: core authored guidance; SoA separate | W | U:A.7.14 |
| ISO-A.7.14-removal | Sensitive information removal | R A.7.14; I4 contents iv; N53 MP-6; R ask/outcome; N88 4.3,4.5 | G: core authored guidance; SoA separate | W | U:A.7.14 |
| ISO-A.7.14-software | Software and entitlements at retirement | R A.7.14; I4 contents iv; N53 MP-6; R plain; authored licensing safeguard | G: core authored guidance; SoA separate | W | U:A.7.14 |
| ISO-A.7.14-verification | Verified sanitization result | R A.7.14; I4 contents iv; N53 MP-6; R review/gaps; N88 4.3,4.5 | G: core authored guidance; SoA separate | W | U:A.7.14 |
| ISO-A.8.1-population | Endpoint safeguard coverage | R A.8.1; I4 contents iv; N53 AC-19, CM-8; R start/gaps | G: core authored guidance; SoA separate | W | U:A.8.1 |
| ISO-A.8.1-protection | Endpoint protection settings | R A.8.1; I4 contents iv; N53 AC-19; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.1 |
| ISO-A.8.1-maintenance | Endpoint protection health | R A.8.1; I4 contents iv; N53 AC-19, CM-8; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.8.1 |
| ISO-A.8.2-need | Need for elevated permissions | R A.8.2; I4 contents iv; N53 AC-6; R plain/ask | G: core authored guidance; SoA separate | W | U:A.8.2 |
| ISO-A.8.2-approval | Privilege authorization | R A.8.2; I4 contents iv; N53 AC-2, AC-6; R start/outcome | G: core authored guidance; SoA separate | W | U:A.8.2 |
| ISO-A.8.2-use | Controlled privileged use | R A.8.2; I4 contents iv; N53 AC-6; R evidence/review | G: core authored guidance; SoA separate | W | U:A.8.2 |
| ISO-A.8.2-lifecycle | Privilege lifecycle | R A.8.2; I4 contents iv; N53 AC-2, AC-6(7); R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.2 |
| ISO-A.8.3-rules | Information authorization rules | R A.8.3; I4 contents iv; N53 AC-3; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.3 |
| ISO-A.8.3-enforcement | Information access enforcement | R A.8.3; I4 contents iv; N53 AC-3; R start/gaps | G: core authored guidance; SoA separate | W | U:A.8.3 |
| ISO-A.8.3-paths | Alternate information access | R A.8.3; I4 contents iv; N53 AC-3; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.8.3 |
| ISO-A.8.3-changes | Information permission changes | R A.8.3; I4 contents iv; N53 AC-2, AC-3; R review | G: core authored guidance; SoA separate | W | U:A.8.3 |
| ISO-A.8.4-scope | Protected development assets | R A.8.4; I4 contents iv; N53 AC-3, CM-5; R plain/start | G: core authored guidance; SoA separate | W | U:A.8.4 |
| ISO-A.8.4-read | Development read permissions | R A.8.4; I4 contents iv; N53 AC-3; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.8.4 |
| ISO-A.8.4-change | Development change permissions | R A.8.4; I4 contents iv; N53 CM-5; R evidence/review | G: core authored guidance; SoA separate | W | U:A.8.4 |
| ISO-A.8.4-lifecycle | Development access lifecycle | R A.8.4; I4 contents iv; N53 AC-2; R gaps | G: core authored guidance; SoA separate | W | U:A.8.4 |
| ISO-A.8.5-strength | Authentication strength | R A.8.5; I4 contents iv; N53 IA-2, IA-5; R plain | G: core authored guidance; SoA separate | W | U:A.8.5 |
| ISO-A.8.5-enforcement | Authentication enforcement coverage | R A.8.5; I4 contents iv; N53 IA-2, IA-8; R start/gaps | G: core authored guidance; SoA separate | W | U:A.8.5 |
| ISO-A.8.5-attempts | Authentication attempt safeguards | R A.8.5; I4 contents iv; N53 AC-7, IA-5; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.5 |
| ISO-A.8.5-recovery | Authentication recovery safeguards | R A.8.5; I4 contents iv; N53 IA-5; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.8.5 |
| ISO-A.8.6-measurement | Current capacity visibility | R A.8.6; I4 contents iv; N53 SC-5(2); R plain/start | G: core authored guidance; SoA separate | W | U:A.8.6 |
| ISO-A.8.6-demand | Future capacity needs | R A.8.6; I4 contents iv; N53 SC-5(2); R evidence/outcome | G: core authored guidance; SoA separate | W | U:A.8.6 |
| ISO-A.8.6-adjustment | Capacity adjustment | R A.8.6; I4 contents iv; N53 SC-5(2); R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.6 |
| ISO-A.8.7-prevention | Malware prevention coverage | R A.8.7; I4 contents iv; N53 SI-3; R plain/start | G: core authored guidance; SoA separate | W | U:A.8.7 |
| ISO-A.8.7-detection | Malware detection | R A.8.7; I4 contents iv; N53 SI-3; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.7 |
| ISO-A.8.7-response | Malware containment and recovery | R A.8.7; I4 contents iv; N53 SI-3, IR-4; R review/outcome | G: core authored guidance; SoA separate | W | U:A.8.7 |
| ISO-A.8.7-awareness | Malware user precautions | R A.8.7; I4 contents iv; N53 AT-2, SI-3; R plain; authored awareness probe | G: core authored guidance; SoA separate | W | U:A.8.7 |
| ISO-A.8.8-discovery | Vulnerability identification | R A.8.8; I4 contents iv; N53 RA-5; R plain/start | G: core authored guidance; SoA separate | W | U:A.8.8 |
| ISO-A.8.8-exposure | Vulnerability exposure assessment | R A.8.8; I4 contents iv; N53 RA-5; R ask/evidence | G: core authored guidance; SoA separate | W | U:A.8.8 |
| ISO-A.8.8-treatment | Vulnerability treatment | R A.8.8; I4 contents iv; N53 SI-2, RA-5; R review/outcome | G: core authored guidance; SoA separate | W | U:A.8.8 |
| ISO-A.8.8-verification | Verified vulnerability closure | R A.8.8; I4 contents iv; N53 SI-2; R gaps/outcome | G: core authored guidance; SoA separate | W | U:A.8.8 |
| ISO-A.8.9-baseline | Approved security configuration | R A.8.9; I4 contents iv; N53 CM-2, CM-6; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.9 |
| ISO-A.8.9-deployment | Applied configuration coverage | R A.8.9; I4 contents iv; N53 CM-2, CM-6; R start/outcome | G: core authored guidance; SoA separate | W | U:A.8.9 |
| ISO-A.8.9-drift | Configuration drift handling | R A.8.9; I4 contents iv; N53 CM-6; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.9 |
| ISO-A.8.9-updates | Configuration maintenance | R A.8.9; I4 contents iv; N53 CM-2; R plain/review | G: core authored guidance; SoA separate | W | U:A.8.9 |
| ISO-A.8.10-decision | Information deletion decisions | R A.8.10; I4 contents iv; N53 SI-12; R plain/ask | G: core authored guidance; SoA separate | W | U:A.8.10 |
| ISO-A.8.10-coverage | Deletion scope and copies | R A.8.10; I4 contents iv; N53 SI-12; R start/gaps | G: core authored guidance; SoA separate | W | U:A.8.10 |
| ISO-A.8.10-execution | Information deletion execution | R A.8.10; I4 contents iv; N53 SI-12, MP-6; R evidence/outcome; N88 4.3,4.5 | G: core authored guidance; SoA separate | W | U:A.8.10 |
| ISO-A.8.10-verification | Deletion result handling | R A.8.10; I4 contents iv; N53 SI-12; R review/gaps; N88 4.3,4.5 | G: core authored guidance; SoA separate | W | U:A.8.10 |
| ISO-A.8.11-needs | Data masking needs | R A.8.11; I4 contents iv; N53 SI-19; R plain/start | G: core authored guidance; SoA separate | W | U:A.8.11 |
| ISO-A.8.11-application | Effective masked outputs | R A.8.11; I4 contents iv; N53 SI-19; R evidence/outcome | G: core authored guidance; SoA separate | W | U:A.8.11 |
| ISO-A.8.11-reconstruction | Masking reconstruction exposure | R A.8.11; I4 contents iv; N53 SI-19; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.11 |
| ISO-A.8.11-originals | Access to original masked data | R A.8.11; I4 contents iv; N53 AC-3, SI-19; R review/outcome | G: core authored guidance; SoA separate | W | U:A.8.11 |
| ISO-A.8.12-routes | Data leakage exposure | R A.8.12; I4 contents iv; N53 AC-4; R plain/ask | G: core authored guidance; SoA separate | W | U:A.8.12 |
| ISO-A.8.12-measures | Data leakage safeguards | R A.8.12; I4 contents iv; N53 AC-4; R evidence/gaps | G: core authored guidance; SoA separate | W | U:A.8.12 |
| ISO-A.8.12-operation | Data leakage control operation | R A.8.12; I4 contents iv; N53 AC-4, SI-4; R start/outcome | G: core authored guidance; SoA separate | W | U:A.8.12 |
| ISO-A.8.12-response | Data leakage follow-through | R A.8.12; I4 contents iv; N53 SI-4, IR-4; R review/gaps | G: core authored guidance; SoA separate | W | U:A.8.12 |
| ISO-A.8.13-scope | Backup scope and recovery need | R A.8.13; I4 contents iv; N53 CP-9; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.13 |
| ISO-A.8.13-protection | Backup confidentiality and resilience | R A.8.13; I4 contents iv; N53 CP-9; R evidence/outcome | G: core authored guidance; SoA separate | W | U:A.8.13 |
| ISO-A.8.13-operation | Backup failure handling | R A.8.13; I4 contents iv; N53 CP-9; R start/gaps | G: core authored guidance; SoA separate | W | U:A.8.13 |
| ISO-A.8.13-restoration | Backup restoration testing | R A.8.13; I4 contents iv; N53 CP-9(1), CP-9(2), CP-10; R ask/review | G: core authored guidance; SoA separate | W | U:A.8.13 |
| ISO-A.8.14-needs | Redundancy availability need | R A.8.14; I4 contents iv; N53 CP-2, CP-7; R plain/ask | G: core authored guidance; SoA separate | W | U:A.8.14 |
| ISO-A.8.14-design | Redundancy and common failures | R A.8.14; I4 contents iv; N53 CP-7, CP-10; R evidence/gaps | G: core authored guidance; SoA separate | W | U:A.8.14 |
| ISO-A.8.14-operation | Working processing redundancy | R A.8.14; I4 contents iv; N53 CP-4, CP-10; R start/outcome | G: core authored guidance; SoA separate | W | U:A.8.14 |
| ISO-A.8.15-events | Security event coverage | R A.8.15; I4 contents iv; N53 AU-2, AU-12; R plain/start | G: core authored guidance; SoA separate | W | U:A.8.15 |
| ISO-A.8.15-content | Useful event context | R A.8.15; I4 contents iv; N53 AU-3; R evidence/gaps | G: core authored guidance; SoA separate | W | U:A.8.15 |
| ISO-A.8.15-protection | Event record protection | R A.8.15; I4 contents iv; N53 AU-9; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.8.15 |
| ISO-A.8.15-retention | Log retention and retrieval | R A.8.15; I4 contents iv; N53 AU-11; R evidence/review | G: core authored guidance; SoA separate | W | U:A.8.15 |
| ISO-A.8.15-analysis | Analysis of recorded events | R A.8.15; I4 contents iv; N53 AU-6; R plain; authored analysis probe | G: core authored guidance; SoA separate | W | U:A.8.15 |
| ISO-A.8.16-coverage | Activity monitoring coverage | R A.8.16; I4 contents iv; N53 SI-4; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.16 |
| ISO-A.8.16-detection | Anomalous activity detection | R A.8.16; I4 contents iv; N53 SI-4; R start/outcome | G: core authored guidance; SoA separate | W | U:A.8.16 |
| ISO-A.8.16-investigation | Monitoring investigation | R A.8.16; I4 contents iv; N53 SI-4, IR-4; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.16 |
| ISO-A.8.16-health | Monitoring availability and usefulness | R A.8.16; I4 contents iv; N53 SI-4(9); R review/evidence | G: core authored guidance; SoA separate | W | U:A.8.16 |
| ISO-A.8.17-reference | System time references | R A.8.17; I4 contents iv; N53 AU-8(1); R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.17 |
| ISO-A.8.17-synchronization | System clock synchronization | R A.8.17; I4 contents iv; N53 AU-8(1); R start/outcome | G: core authored guidance; SoA separate | W | U:A.8.17 |
| ISO-A.8.17-health | Time synchronization health | R A.8.17; I4 contents iv; N53 AU-8(1); R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.17 |
| ISO-A.8.18-identification | Privileged utility exposure | R A.8.18; I4 contents iv; N53 CM-7, AC-6; R plain/start | G: core authored guidance; SoA separate | W | U:A.8.18 |
| ISO-A.8.18-restriction | Privileged utility access | R A.8.18; I4 contents iv; N53 AC-6, CM-7; R evidence/gaps | G: core authored guidance; SoA separate | W | U:A.8.18 |
| ISO-A.8.18-authorization | Privileged utility authorization | R A.8.18; I4 contents iv; N53 AC-6; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.8.18 |
| ISO-A.8.18-accountability | Privileged utility accountability | R A.8.18; I4 contents iv; N53 AC-6(9); R review/outcome | G: core authored guidance; SoA separate | W | U:A.8.18 |
| ISO-A.8.19-rules | Operational installation rules | R A.8.19; I4 contents iv; N53 CM-11; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.19 |
| ISO-A.8.19-restriction | Installation access control | R A.8.19; I4 contents iv; N53 CM-11, CM-5; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.19 |
| ISO-A.8.19-procedure | Secure operational installation | R A.8.19; I4 contents iv; N53 CM-3, CM-5; R start/review | G: core authored guidance; SoA separate | W | U:A.8.19 |
| ISO-A.8.19-outcome | Installation follow-through | R A.8.19; I4 contents iv; N53 CM-11; R outcome | G: core authored guidance; SoA separate | W | U:A.8.19 |
| ISO-A.8.20-understanding | Network connection scope | R A.8.20; I4 contents iv; N53 SC-7; R plain/start | G: core authored guidance; SoA separate | W | U:A.8.20 |
| ISO-A.8.20-protection | Network traffic protection | R A.8.20; I4 contents iv; N53 SC-7, SC-8; R evidence/outcome | G: core authored guidance; SoA separate | W | U:A.8.20 |
| ISO-A.8.20-management | Protected network administration | R A.8.20; I4 contents iv; N53 AC-6, CM-6; R plain/review | G: core authored guidance; SoA separate | W | U:A.8.20 |
| ISO-A.8.20-operation | Current network control coverage | R A.8.20; I4 contents iv; N53 SC-7; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.20 |
| ISO-A.8.21-security | Network-service security needs | R A.8.21; I4 contents iv; N53 SA-9; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.21 |
| ISO-A.8.21-levels | Network-service level needs | R A.8.21; I4 contents iv; N53 SA-9; R start; authored service-level probe | G: core authored guidance; SoA separate | W | U:A.8.21 |
| ISO-A.8.21-agreement | Agreed network safeguards | R A.8.21; I4 contents iv; N53 SA-9; R evidence/gaps | G: core authored guidance; SoA separate | W | U:A.8.21 |
| ISO-A.8.21-delivery | Network-service assurance | R A.8.21; I4 contents iv; N53 SA-9; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.8.21 |
| ISO-A.8.22-groups | Network separation needs | R A.8.22; I4 contents iv; N53 SC-7; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.22 |
| ISO-A.8.22-flows | Enforced network segregation | R A.8.22; I4 contents iv; N53 SC-7, AC-4; R start/gaps | G: core authored guidance; SoA separate | W | U:A.8.22 |
| ISO-A.8.22-validation | Working network separation | R A.8.22; I4 contents iv; N53 SC-7; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.8.22 |
| ISO-A.8.23-intent | Web-content protection needs | R A.8.23; I4 contents iv; N53 SI-3, SC-7; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.23 |
| ISO-A.8.23-enforcement | Web-content enforcement coverage | R A.8.23; I4 contents iv; N53 SC-7, SI-3; R start/ask | G: core authored guidance; SoA separate | W | U:A.8.23 |
| ISO-A.8.23-exceptions | Web-content exceptions | R A.8.23; I4 contents iv; N53 SC-7; R review/gaps | G: core authored guidance; SoA separate | W | U:A.8.23 |
| ISO-A.8.23-operation | Working web-content protection | R A.8.23; I4 contents iv; N53 SI-3, SC-7; R evidence/outcome | G: core authored guidance; SoA separate | W | U:A.8.23 |
| ISO-A.8.24-rules | Cryptographic protection needs | R A.8.24; I4 contents iv; N53 SC-13; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.24 |
| ISO-A.8.24-implementation | Cryptographic enforcement | R A.8.24; I4 contents iv; N53 SC-13; R start/outcome | G: core authored guidance; SoA separate | W | U:A.8.24 |
| ISO-A.8.24-custody | Cryptographic key custody | R A.8.24; I4 contents iv; N53 SC-12; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.24 |
| ISO-A.8.24-lifecycle | Cryptographic key lifecycle | R A.8.24; I4 contents iv; N53 SC-12; R review/outcome | G: core authored guidance; SoA separate | W | U:A.8.24 |
| ISO-A.8.24-arrangement-note | Cryptographic arrangement | R A.8.24; I4 contents iv; N53 SC-12; R evidence; optional authored note | O: optional; does not affect status | W | U:A.8.24 |
| ISO-A.8.25-rules | Development lifecycle security rules | R A.8.25; I4 contents iv; N53 SA-3, SA-15; N218 PO.1; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.25 |
| ISO-A.8.25-stages | Development security in operation | R A.8.25; I4 contents iv; N53 SA-3; N218 PW.1; R start/outcome | G: core authored guidance; SoA separate | W | U:A.8.25 |
| ISO-A.8.25-decisions | Security-informed delivery | R A.8.25; I4 contents iv; N53 SA-15; N218 PO.4; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.25 |
| ISO-A.8.26-identification | Application security requirements | R A.8.26; I4 contents iv; N53 SA-4; N218 PO.1; R plain/ask | G: core authored guidance; SoA separate | W | U:A.8.26 |
| ISO-A.8.26-agreement | Agreed application security needs | R A.8.26; I4 contents iv; N53 SA-4; N218 PO.1; R evidence/review | G: core authored guidance; SoA separate | W | U:A.8.26 |
| ISO-A.8.26-acceptance | Application security acceptance | R A.8.26; I4 contents iv; N53 SA-4, SA-11; N218 PO.4; R start/gaps | G: core authored guidance; SoA separate | W | U:A.8.26 |
| ISO-A.8.26-changes | Changed application security needs | R A.8.26; I4 contents iv; N53 SA-4; N218 PW.1.2; R plain/outcome | G: core authored guidance; SoA separate | W | U:A.8.26 |
| ISO-A.8.27-principles | Security engineering principles | R A.8.27; I4 contents iv; N53 SA-8; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.27 |
| ISO-A.8.27-application | Applied security architecture | R A.8.27; I4 contents iv; N53 SA-8; N218 PW.1; R start/ask | G: core authored guidance; SoA separate | W | U:A.8.27 |
| ISO-A.8.27-changes | Security design changes | R A.8.27; I4 contents iv; N53 SA-8, CM-4; N218 PW.1.2; R gaps/outcome | G: core authored guidance; SoA separate | W | U:A.8.27 |
| ISO-A.8.28-practices | Relevant secure coding practices | R A.8.28; I4 contents iv; N53 SA-15; N218 PW.5; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.28 |
| ISO-A.8.28-application | Applied secure coding | R A.8.28; I4 contents iv; N53 SA-15; N218 PW.5; R start/outcome | G: core authored guidance; SoA separate | W | U:A.8.28 |
| ISO-A.8.28-review | Security examination of code | R A.8.28; I4 contents iv; N53 SA-11; N218 PW.7; R review/ask | G: core authored guidance; SoA separate | W | U:A.8.28 |
| ISO-A.8.28-correction | Coding defect follow-through | R A.8.28; I4 contents iv; N53 SA-11; N218 PW.7; R gaps/outcome | G: core authored guidance; SoA separate | W | U:A.8.28 |
| ISO-A.8.29-planning | Risk-informed security test scope | R A.8.29; I4 contents iv; N53 SA-11; N218 PO.4, PW.8; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.29 |
| ISO-A.8.29-execution | Security testing execution | R A.8.29; I4 contents iv; N53 SA-11; N218 PW.8; R start/review | G: core authored guidance; SoA separate | W | U:A.8.29 |
| ISO-A.8.29-issues | Security test finding resolution | R A.8.29; I4 contents iv; N53 SA-11; N218 PW.8; R gaps/outcome | G: core authored guidance; SoA separate | W | U:A.8.29 |
| ISO-A.8.29-acceptance | Security-informed acceptance | R A.8.29; I4 contents iv; N53 SA-4, SA-11; N218 PO.4; R ask/evidence | G: core authored guidance; SoA separate | W | U:A.8.29 |
| ISO-A.8.30-expectations | Outsourced development security expectations | R A.8.30; I4 contents iv; N53 SA-4, SA-9; N218 PO.1; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.30 |
| ISO-A.8.30-oversight | Outsourced development monitoring | R A.8.30; I4 contents iv; N53 SA-9, SA-15; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.30 |
| ISO-A.8.30-acceptance | External deliverable acceptance | R A.8.30; I4 contents iv; N53 SA-4, SA-11; N218 PO.4; R start/outcome | G: core authored guidance; SoA separate | W | U:A.8.30 |
| ISO-A.8.30-followthrough | Outsourced development follow-through | R A.8.30; I4 contents iv; N53 SA-9; R review/gaps | G: core authored guidance; SoA separate | W | U:A.8.30 |
| ISO-A.8.31-boundaries | Environment separation design | R A.8.31; I4 contents iv; N53 CM-4(1), SC-7; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.31 |
| ISO-A.8.31-access | Environment access restrictions | R A.8.31; I4 contents iv; N53 CM-5; R ask/gaps | G: core authored guidance; SoA separate | W | U:A.8.31 |
| ISO-A.8.31-promotion | Controlled production promotion | R A.8.31; I4 contents iv; N53 CM-3, CM-5; R start/outcome | G: core authored guidance; SoA separate | W | U:A.8.31 |
| ISO-A.8.31-data | Cross-environment information protection | R A.8.31; I4 contents iv; N53 AC-3; R ask/review | G: core authored guidance; SoA separate | W | U:A.8.31 |
| ISO-A.8.32-impact | Security impact of changes | R A.8.32; I4 contents iv; N53 CM-4; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.32 |
| ISO-A.8.32-authorization | Authorized changes | R A.8.32; I4 contents iv; N53 CM-3; R start/review | G: core authored guidance; SoA separate | W | U:A.8.32 |
| ISO-A.8.32-execution | Controlled change implementation | R A.8.32; I4 contents iv; N53 CM-3, CM-4; R evidence/outcome | G: core authored guidance; SoA separate | W | U:A.8.32 |
| ISO-A.8.32-verification | Change result verification | R A.8.32; I4 contents iv; N53 CM-3; R start/gaps | G: core authored guidance; SoA separate | W | U:A.8.32 |
| ISO-A.8.32-urgent-context | Urgent change context | R A.8.32; I4 contents iv; N53 CM-3 discussion; R ask | X: context only; reason required for irrelevance | W | U:A.8.32 |
| ISO-A.8.32-urgent | Controlled urgent changes | R A.8.32; I4 contents iv; N53 CM-3 discussion; R ask/gaps | C-G: ISO-A.8.32-urgent-context = Relevant | W | U:A.8.32 |
| ISO-A.8.33-selection | Suitable test information | R A.8.33; I4 contents iv; N53 AC-3, SI-19; R plain/ask | G: core authored guidance; SoA separate | W | U:A.8.33 |
| ISO-A.8.33-protection | Protected test information | R A.8.33; I4 contents iv; N53 AC-3, SI-19; R evidence/outcome | G: core authored guidance; SoA separate | W | U:A.8.33 |
| ISO-A.8.33-live-context | Live-derived test-data context | R A.8.33; I4 contents iv; N53 SI-19; R ask | X: context only; reason required for irrelevance | W | U:A.8.33 |
| ISO-A.8.33-live | Authorized live-derived test data | R A.8.33; I4 contents iv; N53 AC-3, SI-19; R start/ask | C-G: ISO-A.8.33-live-context = Relevant | W | U:A.8.33 |
| ISO-A.8.33-retention | Test information retention | R A.8.33; I4 contents iv; N53 SI-12; R start/gaps | G: core authored guidance; SoA separate | W | U:A.8.33 |
| ISO-A.8.34-agreement | Audit testing authorization | R A.8.34; I4 contents iv; N53 CA-2, CA-8; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.34 |
| ISO-A.8.34-access | Audit test access limits | R A.8.34; I4 contents iv; N53 AC-6, CA-8; R start/gaps | G: core authored guidance; SoA separate | W | U:A.8.34 |
| ISO-A.8.34-safeguards | Operational protection during testing | R A.8.34; I4 contents iv; N53 CA-2, CA-8 discussion; R ask/outcome | G: core authored guidance; SoA separate | W | U:A.8.34 |
| ISO-A.8.34-oversight | Audit test operational oversight | R A.8.34; I4 contents iv; N53 CA-2, CA-8 discussion; R ask/review | G: core authored guidance; SoA separate | W | U:A.8.34 |
| ISO-A.8.34-closure | Audit test closure | R A.8.34; I4 contents iv; N53 AC-2, CA-2; R plain/evidence | G: core authored guidance; SoA separate | W | U:A.8.34 |

## Exact licensed-source uncertainty ledger

Every U entry requires legitimate access to the entire applicable 27001:2022 Annex A
control statement and its qualifications. Related 27002 implementation details, if used,
need a separately bounded guidance comparison; they do not automatically add mandatory
27001 requirements. The observations below identify material open checks rather than
asserting that an absent source has any particular wording.

| Reference | Material question for full-source comparison |
| --- | --- |
| U:A.7.1 | Exact boundary-strength, perimeter design and qualification wording; barriers and upkeep questions are practical probes. |
| U:A.7.2 | Exact entry, visitor and access-point obligations; delivery-route safeguards are a conditional practical subpart. |
| U:A.7.3 | Exact facility design and protection qualifications; visibility and unattended-operation probes are authored guidance. |
| U:A.7.4 | Exact monitoring continuity, coverage and qualification wording; chosen methods must be checked against legitimate full control text. |
| U:A.7.5 | Exact scope of natural, deliberate and other physical threats and the required protection qualification. |
| U:A.7.6 | Exact secure-area working rules and qualifications; recording restrictions are risk-based guidance rather than an asserted universal ban. |
| U:A.7.7 | Exact paper/media and screen protection wording and policy qualification; no prescribed lock timeout is established. |
| U:A.7.8 | Exact equipment-siting and protection qualifications, including confidentiality and environmental exposure. |
| U:A.7.9 | Exact coverage of assets used away from premises and custody/handling qualifications; loss response is supporting practice. |
| U:A.7.10 | Exact media lifecycle and classification-related obligations, including acquisition, transport, use and disposal. |
| U:A.7.11 | Exact supporting-utility disruption qualifications; no universal generator, runtime or test interval is established. |
| U:A.7.12 | Exact power/communications cable coverage and interception, interference and damage qualifications. |
| U:A.7.13 | Exact maintenance objectives and access/information-protection qualifications; off-site release is a conditional guidance subpart. |
| U:A.7.14 | Exact checking/removal obligations for sensitive data and licensed software before disposal or reuse; no universal method is established. |
| U:A.8.1 | Exact endpoint storage, processing and access coverage and endpoint-protection qualifications. |
| U:A.8.2 | Exact restrictions on allocation/use of privileged rights and required oversight qualifications. |
| U:A.8.3 | Exact information-access restriction wording and relationship to the organization's access rules. |
| U:A.8.4 | Exact read/write coverage of source code, development tools and software libraries; technical implementation details remain guidance. |
| U:A.8.5 | Exact authentication procedures/technology wording and access-restriction relationship; no universal factor or product mandate is established. |
| U:A.8.6 | Exact current/expected capacity monitoring and adjustment qualifications; forecast format and thresholds are organization-specific. |
| U:A.8.7 | Exact malware protection and user-awareness qualifications; no universal endpoint agent or training cadence is established. |
| U:A.8.8 | Exact vulnerability information, exposure evaluation and action wording; no universal scanner or patch deadline is established. |
| U:A.8.9 | Exact establishing, documenting, implementing, monitoring and reviewing configuration duties; health checks are authored probes. |
| U:A.8.10 | Exact deletion coverage and retention qualification; replication/backup/provider handling requires the actual organization's retention design. |
| U:A.8.11 | Exact masking, access-rule, related-policy and legal qualification; technique selection and re-identification probes are supporting guidance. |
| U:A.8.12 | Exact leakage-prevention coverage across systems, networks and devices; a marketed DLP tool is not established as mandatory. |
| U:A.8.13 | Exact backup maintenance/testing and policy qualifications, including information/software/system scope; no universal daily or restore cadence is established. |
| U:A.8.14 | Exact sufficiency of redundancy for availability needs; no universal topology or failover target is established. |
| U:A.8.15 | Exact production, storage, protection and analysis obligations for relevant logs; fields/retention/analysis design needs local decisions. |
| U:A.8.16 | Exact network/system/application monitoring and anomaly-evaluation qualifications; signal/health probes are practical guidance. |
| U:A.8.17 | Exact approved-time-source and clock-synchronization qualifications; no universal protocol, tolerance or observation interval is established. |
| U:A.8.18 | Exact restrictions/control of utility programs capable of overriding safeguards; tracing significant use is supporting practice. |
| U:A.8.19 | Exact secure management of operational software installation; procedure and failure-handling details are supporting guidance. |
| U:A.8.20 | Exact protection/control of networks and network devices in relation to information and applications. |
| U:A.8.21 | Exact security mechanisms, service levels and service requirements/delivery qualifications; no universal SLA is established. |
| U:A.8.22 | Exact segregation of information services, users and systems; logical/physical design alternatives need local assessment. |
| U:A.8.23 | Exact external-website access-management purpose and qualifications; filter categories and exceptions are local design decisions. |
| U:A.8.24 | Exact effective cryptographic use, rules and key-management qualifications; no universal algorithm, vendor or rotation cadence is established. |
| U:A.8.25 | Exact security rules for software/system development and their application across the lifecycle. |
| U:A.8.26 | Exact identifying, specifying and approving application-security requirements for development/acquisition; requirement maintenance is supporting practice. |
| U:A.8.27 | Exact establishing, documenting, maintaining and applying engineering principles to system development; review format is guidance. |
| U:A.8.28 | Exact secure-coding principle application and qualifications; review/analysis/correction methods are supporting guidance. |
| U:A.8.29 | Exact testing-process definition/implementation across development and acceptance; no universal testing technique is established. |
| U:A.8.30 | Exact directing, monitoring and reviewing outsourced development; contracts/acceptance are authored implementation probes. |
| U:A.8.31 | Exact separation and protection of development, testing and production environments; no universal account or physical-separation design is established. |
| U:A.8.32 | Exact change-management duties for processing facilities and systems; urgent-change routing is conditional supporting guidance. |
| U:A.8.33 | Exact appropriate selection, protection and management of test information; live-derived safeguards are a conditional practical subpart. |
| U:A.8.34 | Exact planning/agreement duties for operational-system audit testing; access limits, stop and closure practices are supporting guidance. |

## Local validation boundary

The content self-check validates the exact 48 native IDs, native title/specification,
required text fields, 2–6 groups per definition, globally unique ISO-prefixed IDs,
choice sets, source-reference resolution, condition targets, unconditional substantive
questions on every control, and one matrix row per question. It does not run the engine,
change SoA data, exercise a browser or establish normative completeness. No git commit,
push, deployment or browser/session operation was performed for this content scope.
