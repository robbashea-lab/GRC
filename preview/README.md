# Isolated dashboard preview

Run `npm run build` from the repository root to build the chat preview.
The preview runner explicitly enables `REACT_APP_PREVIEW=true` and clears the
backend URL. The login page offers one Sign In button with no credentials.
It opens the existing Platform Portfolio and client dashboards as Preview Admin.

The preview adapter uses only synthetic snapshots generated from the existing
backend seed and GET endpoints. It never contacts Emergent, Railway, or a live
API. Entry persists in this browser until logout. This is a demo entry marker,
not a real account session. Sample records are read-only; writes fail explicitly
instead of pretending to save. Uncaptured endpoints report an unavailable view.

Regenerate fixtures using the dependencies in `preview/requirements.txt`:
`python preview/generate-fixtures.py`. The generator uses an isolated in-memory
database and does not load environment files or capture operational records.

Normal frontend `build` and `start` scripts retain the real authentication flow
when REACT_APP_PREVIEW is unset. They require REACT_APP_BACKEND_URL configured
for an actual backend. Backend authentication and tenant authorization are
unchanged. Do not enable preview mode when testing real authentication or data
persistence.
