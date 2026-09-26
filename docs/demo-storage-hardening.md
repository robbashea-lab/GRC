# Demo storage and recovery

## Inspected architecture

Demo records use one JSON entry, `grc_interactive_demo_v3`, in sessionStorage. Reading it removes the retired `grc_interactive_demo_v2` entry (the former seven-client portfolio).
Previously this included every uploaded base64 file. A 1 MiB per-file limit did
not limit their aggregate size. All storage write failures shared one message.
There is no Demo IndexedDB, persistent blob store, or Safari-specific path.
Standard-mode evidence continues to use the configured server API.

## Bounded file retention

- Reject files larger than 1 MiB before FileReader, and again in the Demo adapter.
- Retain files no larger than 16 KiB only within a shared 256 KiB serialized
  payload budget (UTF-16 estimate). These include lightweight synthetic fixtures.
- Keep other accepted content in an 8 MiB bounded, document-local memory cache.
  Reload, clearing, or eviction can remove content, never its evidence record.
- Preserve filename, MIME type, size, dates, IDs, hashes and relationships.
- Downloads explain unavailable content instead of fabricating a replacement.
- Never silently report an unsuccessful metadata write as saved.

Limits bound file payloads, not all metadata. Browser storage can still be denied
or exhausted by metadata or unrelated origin storage. No retry loop or silent
volatile fallback is used. A browser reporting denial as QuotaExceededError
cannot reliably be distinguished from true exhaustion; classification follows
the exception reported by the browser.

## Recovery

The Demo banner's **Demo storage** menu provides diagnostics and two confirmations:

1. **Clear Demo Evidence Files** strips all persisted file contents and empties
   the memory cache, retaining evidence metadata and every other business record,
   user, role, membership, assessment and relationship.
2. **Reset Demo Data** atomically replaces mutable Demo records with the canonical
   relative-date seed and clears the cache. It restores three clients (Brawndo, Dunder Mifflin,
   Prestige Worldwide), 10 users and 68 synthetic evidence items in the current seed. Non-demo stores are not
   reset. Selection is returned to the client portfolio.

Canonical application roles remain super_admin, platform_admin,
client_contributor and client_readonly. No new RBAC roles or accounts are created.
Existing persona assignments and client scopes survive clearing; reset reseeds
them. Recovery endpoints operate only inside the explicitly selected Demo adapter.

Legacy large/over-budget payloads are removed on read with metadata preserved.
Migration is idempotent; file content may survive temporarily in the bounded
cache. Clear and reset operate before normal store loading so they do not depend
on migration succeeding. Cache entries for deleted evidence are pruned on save;
cache hydration also checks client identity. No IndexedDB cleanup is necessary
because the inspected implementation never used it.

## Diagnostics and verification boundary

Errors distinguish QUOTA_EXCEEDED, STORAGE_UNAVAILABLE, FILE_TOO_LARGE,
WRITE_FAILED and UNKNOWN_STORAGE_ERROR. Development logs contain only code and
operation. The menu reports estimated JSON bytes, evidence count, persisted and
memory payload counts/bytes, and last error. Estimates are not browser quotas.

Automated tests cover persistence, reload, migration, clear/reset, canonical data,
failed-write atomicity, retry, cache budgets/pruning/isolation, failure classes,
pre-read size rejection and standard-mode upload behavior.
Local browser QA uses desktop Edge and iPhone-sized Chromium emulation, including
quota and SecurityError injection. This is not physical iPhone/Safari testing;
WebKit is not installed in the execution environment. Real-device Safari remains
a verification follow-up. No hosting or production deployment is part of this work.
