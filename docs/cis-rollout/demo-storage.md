# Demo reporting storage compatibility

The CIS rollout adds fictional IG2/IG3 history to the existing browser-backed Explore Demo. A regression exercising 25 native ISO scope and guided saves exhausted the existing browser quota because each changed source vector repeated unchanged reference rows.

Reporting serialization version 2 pools exact complete reference rows and stores each vector as indexes. It preserves every observation, scope, source field and native record, and restores independent copies. The reader accepts existing version 1 whole-vector strings; invalid references fail explicitly. File payload budgets, browser quota, permissions and the authenticated Mongo storage contract are unchanged.

New saves use version 2. Older application revisions cannot read that reporting format. Before reverting to an older build, preserve the current Demo state separately and plan an explicit compatible conversion; do not silently reset or reseed retained browser data. No startup or shared Mongo migration is introduced. Demo remains bounded by browser storage and file-payload limits.
