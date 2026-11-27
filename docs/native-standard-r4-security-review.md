# R4 integrity and authorization review

This is an implementation review record, not certification or an independent human security assessment.

## Guidance checked

On November 19, 2026, NIST's publication index identifies SSDF 1.1 (SP 800-218) as final and SSDF 1.2 (SP 800-218 Rev. 1) as a draft. Use final guidance as the baseline and identify draft material explicitly. [NIST SSDF publications](https://csrc.nist.gov/Projects/ssdf/publications).

OWASP identifies ASVS 5.0.0 as its stable release, separately from its changing development branch. The relevant verification concerns here are authorization, tenant boundaries, validation, evidence access, state transitions, concurrency and safe failure. Referencing that guidance does not establish ASVS compliance. [OWASP ASVS stable downloads](https://asvs.owasp.org/downloads/).

## Trust boundaries and failure consequences

- A browser-supplied client, actor, role, checklist, template, support label, tool ID or assessment proposal is untrusted input. Native server commands resolve the current account, authorized tenant, saved scope and authoritative record version.
- Service selection, reported tool coverage and recurring external-ticket configuration are not evidence that a control operated. Future dates are scheduling context, never completion or assurance.
- Review completion binds the actual occurrence and canonical template; every actual supplied step needs an explicit result and every non-Pass result a reason. A denied command must not create history, advance recurrence, change ratings or create corrective work.
- Checkpoint and Apply are drafts. Only a successful native final assessment Save may commit its staged shared service/activity changes. Retained command identities and claims protect recovery; ordinary writes must not overwrite pending intents.
- Completed work and past submitter identities are retained through reassignment and rework. Unknown legacy identities block independent validation until authoritative reconciliation; names and current owners never manufacture historical workers.
- AI decisions, Risk acceptance, Policy approval, Vendor assurance, assessment verification and Finding validation remain distinct authorized decisions. A Review is not a shortcut to any of them.
- Evidence identity is the authorized file/version and actual available content, not a filename or an unchecked client claim. Real byte integrity, current/historical relationships and tenant denials require isolated native tests.

## Verification status

Independent AI source review identified and closed frozen-plan scope/role reauthorization, pending-row list/export/deletion, related-record marker disclosure and checklist draft-loss paths. New native route regressions cover the corresponding denials, exact recovery and retained drafts. Actual file bytes, current version/digest and native supporting relationships are checked before an attachment can qualify required support; explicit completed-result references remain a separate permitted path.

The complete new R4 inventory passed 184 classified cases across 23 modules on disposable real Mongo (169 storage cases and 15 pure rule/format cases), with all 309 participating source hashes unchanged. This includes actual Tool usage scope, pending-population and replacement-denial checks. The three original real-Mongo report snapshot tests also passed, including concurrent source changes within one actual snapshot transaction. Synthetic BSON/index restore, binary/Unicode versions and interruption/retry checks are supporting preservation evidence. They do not prove compatibility with every live customer record or replace an authorized backup.

The second original Windows offline campaign reached its unchanged 30-minute cutoff with 1,269 logged passes, three explicitly skipped Mongo snapshot cases and one unfinished lifecycle case. It is incomplete, not a full-suite pass; the separate actual snapshot run closes only those three skipped cases. Earlier local builds passed but predate the latest frontend corrections. Final builds, complete CI, native browser journeys, actual new Reports HTTP delivery and surface/zoom comparisons remain separate gates. No hosted migration, staging or production deployment is authorized by this document.
