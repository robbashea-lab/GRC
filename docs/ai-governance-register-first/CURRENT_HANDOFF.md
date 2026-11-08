# AI Governance register-first implementation

Owner: Billy Bob. Integration/release owner: Agent 007.
Branch: `codex/ai-governance-20261025`; base `3ce61e8db271824d038827a2df188b7e47d4a8d7`.
Status: local implementation candidate; not release ready. No owner push, CI, staging, or production deployment.

## Scope and decisions

The approved readable HTML drives the register, three-step onboarding, five-tab record, profile dialog, ten reviewed tool presets plus Other, and scoped styles. Native records, permissions, tenant isolation, navigation, evidence, history, Save/Cancel, and zero/multiple Risk links remain authoritative. CIS enrollment uses native program metadata rather than client names.

Final Add is a recoverable native command creating the AI record, linked Risk, optional Vendor, and initial annual AI Review. It uses the genuine server command date and stable child identities across retries. Native Risk/Vendor review behavior remains in their existing writers. Add is not approval, risk acceptance, review completion, or assurance. Unknown screening keeps the proposal Unrated. Vendor linking verifies exact same-client identity and snapshot; names never deduplicate.

Approved production wording replaces prototype-only labels. The five-tab record has no added governance section. Its existing Edit details action opens the complete native editor. New wizard records receive the reviewed ten-question section there, with explicit confirmation invalidated by changed answers/scope. PATCH-only reassessment preserves original provenance and prior screening history. Older records retain their original questionnaire and creation contract. Authenticated existing approval-scope restrictions remain enforced; Demo retains its native reassessment transition.

## Verification and limits

- Native backend regression: 64 tests passed before final alert integration. The affected AI/onboarding regression then passed 29 tests. New questionnaire answers now drive consequential-use and sensitive-data alerts; distinct retained employment/third-party classifications and HR fallback remain effective.
- Final explicit frontend campaign: 87 passed and one Windows timeout in the Prestige AIContract create/edit test, with the original 5000 ms limit unchanged. A matched comparison reproduced that timeout on the exact unchanged base while the candidate passed the isolated case. This does not establish the cause or make the campaign green. Raw failures remain preserved; pinned Linux CI is pending.
- After alert corrections, four affected domain/Demo suites passed 21 tests; the final retained-employment/HR regression passed within the six-test domain suite. Other meaningful coverage includes explicit confirmation invalidation, native legacy fields, exact review payload, retained invalid dates/owner IDs, stale linked-response closure, Evidence upload context loss, and source-level dialog cascade checks.
- Final real Mongo: 12 tests passed on the corrected source, including concurrency/reconnect, native audit actions and IDs, provenance/history, and rejected-retirement side effects. Seven relevant backend/catalog/test files have identical before/after hashes. All 12 generated databases were removed, only owned PID26264 was stopped, and loopback port27204 was confirmed free.
- Exact required staging build (`node scripts/staging.cjs`) and preview build (`node scripts/preview.cjs build`) passed sequentially with all 2128 source files unchanged across compilation. Receipts include commands, public settings and output asset hashes. Earlier bare ordinary and pre-correction preview builds are intermediate evidence only.
- Independent bounded AI source reviews are clear. These are AI reviews, not human approval or browser qualification.
- Existing Python runtime differs from repository FastAPI pin (0.141.1 installed versus 0.110.1 pinned). Mongo proof uses standalone Mongo 8.0.34, native ASGI and signed JWT; it is not browser, replica-set transaction, or deployment proof.

Local evidence is under the owning workspace `outputs/AI-Governance-20261025/`: `backend-regression.log`, `final-frontend-regression.log`, `alert-backend-regression.log`, `alert-frontend-regression.log`, `alert-compatibility-frontend.log`, `FINAL_REAL_MONGO_RESULT.json`, `retention-real-mongo-test.log`, `MONGO_RETENTION_CLEANUP.json`, `FINAL_BUILD_RECEIPT.json`, `final-build-staging.log`, `final-build-preview.log`, and `FINAL_SOURCE_DELIVERY.json`. Earlier receipts and failures remain preserved. The only post-build source-tree update is this handoff document; its delta is recorded separately from compiled production inputs.

## Outstanding release gates

Resolve/classify the Windows Prestige timeout against the base and exact candidate CI. Bind final receipts to the delivered commit/tree, finish independent review, and integrate through 007. Reference rendering denial remains stopped; no rehosting or alternate-browser bypass was attempted. Visual fidelity comparisons at 1440x1000, 1920x1080, 768x1024 and 390x844 in both themes, hosted workflow QA, staging verification and human acceptance remain pending. Tests and builds do not substitute for those gates. Tabs 9 and 11 and their history remain untouched.
