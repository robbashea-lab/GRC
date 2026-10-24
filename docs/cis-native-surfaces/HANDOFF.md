# CIS Reviews, Action Items and Risks integration

Agent 007 is the sole integration, publication and staging deployment coordinator. This work uses branch `codex/cis-native-surfaces-20261024`, based on deployed PR95 commit `b13716fda926e16edcff94009a91731404340679`. It is a separate release: PR95's CI and hosted evidence do not qualify the combined source. No main merge or production deployment is authorized.

## Source provenance and boundaries

The integration preserves the disjoint owned deltas from Reviews `711fa9709ca4be798ca09f5f5535e89ad9d4627b` (10 paths), Action Items `6b612fcdc68565323b00fd24de2f660cdd3ef514` (14 paths) and Risks `d22b09a586811075b8faddcee3eaecc081fda915` (11 paths). Risks was developed on `45b5f09`; only its own delta was replayed, preserving b137's six storage/documentation/test paths. The component handoffs retain their dated development checkpoints; they are not current combined-release results.

Approved concept presentation uses the existing configured CIS IG1/IG2/IG3 eligibility in Explore Demo and authenticated mode, without a client-name whitelist or enrollment change. Native loaded-client checks, identities, permissions, full editors, Save/Cancel, recurrence, evidence, history, validation and connected views remain authoritative. Non-CIS experiences remain outside the concept gates. No dependency, backend, schema, storage budget, seed, credential, role or access change is introduced.

The intentional shared exception is a one-line Finding-creation correction: the editor no longer invents unsupported `source: 'manual'` metadata for a new pilot Finding. Existing supplied values and the strict backend contract remain; unsupported explicit metadata must still fail visibly. The combined Finding, Action, Review and Risk regressions must cover this shared editor.

Robb separately approved CDCP-07 on October 24 in the coordinating Dashboard review chat: the dark concept Risk picker score pill may use the existing occupied-cell dark text color `#172741` on its unchanged pale background. This is a dark-concept-only foreground correction, with light/default/native editor, layout, score, record and navigation behavior preserved. The existing authored-cascade harness covers both stylesheet orders and scope isolation; actual compiled-browser color remains a separate verification step. Risk dense layout remains held.

## Integrated test correction

The first complete local integration invocation exercised 32 suites and 442 cases: 420 passed and 22 failed in two obsolete presentation adapters. The original result is preserved. `QuarterlyChartRollout.test.jsx` now selects the real Reviews/Risks charts, cards, register and matrix, verifies required nodes exist, and selects native Overdue for its unchanged saved April dates. Pending and denied states require actual unavailable/loading evidence rather than optional-null fallbacks. `RegisterNavigationFlicker.test.jsx` uses the new Risk concept's loaded marker. The original case matrix, fixtures, tenant/actor checks, native data equality, retry, no-write assertions and deadlines remain. No case is skipped or replaced by an isolated pass.

The final Reviews reference pass also corrected display capitalization of known native statuses and the approved 10px status text at widths of at least 1700px. The fallback for unknown values, stored statuses, row identity, sort predicates and native handlers remain unchanged. Below that breakpoint, the existing 9px status text remains. These scoped presentation corrections require fresh regression and compiled-browser evidence rather than inheriting the earlier Reviews snapshot's result.

The exact final commit/tree must be obtained from Git and bound to a fresh complete integrated campaign, both unchanged CI build entrypoints, required remote release checks, provider Live revision, served assets and affected native hosted paths. Owner-local and historical native results remain dated; do not add their totals or relabel them as integrated qualification.

## QA and acceptance limits

Mutations are limited to explicitly allocated disposable synthetic records in the existing isolated local fixture. Preserve the protected assessment and genuine history. No shared staging records, accounts or access changes, reseeding or implicit migrations are permitted. Use finite sequential browser/build leases and return them explicitly; do not start competing servers or deployments.

Risk dense same-date layout changes remain explicitly held. Preserve all event identities and date lists; oversized groups are an unresolved acceptance limitation. The denied reference file URL must not be rehosted or bypassed. Supplied source/raster comparison and measured candidate geometry do not prove exact rendered parity. Actual 200% zoom, physical touch, broader role/enrollment coverage, retained persistence and the three unrun replica-set transaction cases require their own evidence; fresh fixtures or ordinary green Mongo checks do not substitute.

Keep one current external release handoff with exact commit/tree, test/build/CI receipts, local fixture budgets and record IDs, deployment and served-build identity, hosted checks, unresolved limits and next owner. Implementation, local qualification, publication, CI, deployment, hosted proof and Robb's acceptance are separate claims.
