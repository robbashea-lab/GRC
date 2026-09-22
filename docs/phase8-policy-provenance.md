# Phase 8 — approval subject inspection and contract

Before this phase: Policy version is mutable text; no Policy document reference
or immutable revision exists. Evidence has stable IDs, filename, version,
SHA-256 and retained bytes; inventory removal archives rather than destroys it.
Evidence links to an authoritative parent. Policy histories contain actor/date
but legacy entries cannot establish an exact artifact.

New submissions require a version and one explicit basis: same-client Evidence
linked to this Policy, or an external reference plus its document/version ID.
External content is not fetched, hashed or claimed verified by Omnisciente.
No duplicate upload is required. Uploaded basis uses existing SHA-256.

A submission freezes the client/Policy, title, summary, version, owner ID, named
business Contact and basis. Decisions copy that subject, never dereference the
current mutable Policy for historical display. Generic content/version changes
to an Approved policy return it to existing Draft and clear current approval
date; history remains intact. Pending content remains locked from Phase 7.

Previously stored history is retained verbatim and labelled as legacy if it has
no subject. No artificial version/hash is backfilled. External approval metadata
remains distinguishable from an authenticated in-app approval.
Policies with decision history are retained; existing Retired state is the
available archival path. Archived Evidence bytes remain available under the
existing authorization rules. This is provenance, not electronic signatures.
