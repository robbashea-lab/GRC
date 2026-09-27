# Omnisciente publishing workflow

Effective 2026-09-27, the authoritative workflow is:

**GitHub main → ChatGPT preview**

## One-time retirement transition

Keep PR #6 unmerged until the former Railway GitHub source connection is removed
or explicitly disabled so merges cannot trigger deployment. Do not deploy Railway,
delete infrastructure/data, or change application code to retire that integration.

Observed 2026-09-27: Omnisciente API reports auto-deploy disabled with
`NO_INSTALLATION`, but its source still names `robbashea-lab/GRC` / `main`.
The connector staged source removal, then discarded it because applying staged
changes could deploy. No deployment was requested. Full source removal is pending
in the service's Settings → Source. Confirm removal before marking this transition
complete. Main remains unchanged and PR #6 remains unmerged in the meantime.

## Normal workflow after transition

1. Validate the feature branch and document failures honestly; approval does not
   turn an unresolved test failure into a pass.
2. Merge approved work into GitHub main.
3. Verify main's exact commit and a clean source checkout.
4. Read `.openai/hosting.json`; run `node frontend/scripts/preview.cjs build`.
5. Publish the exact main source to the existing Sites project
   `appgprj_6a9cafcbde888191ae1b350224562554`, preserving audience and URL:
   https://iventure-grc-code-preview.mr-robbashea.chatgpt.site/
6. Verify successful saved-version deployment and report commit/version status.

Railway is not part of this workflow. After retirement is confirmed, do not use
Railway health, capacity, deployment status or approval questions as merge or
publication gates. Do not reconnect it. Historical reports are evidence of prior
work, not current deployment instructions.

Preserve unrelated application/backend code. Static Demo publication does not
provide persistent backend hosting, real authentication testing, production
readiness or authorization to introduce real client data.

## Current non-Railway publication limitation

The 2026-09-27 Demo build succeeded at `12bbe6c`; local Sites archive packaging
could not start because Bash is unavailable. No new Sites version was published.
Resolve packaging using the supported Sites workflow before claiming publication.
