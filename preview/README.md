# Connected test preview

The browser preview uses the application's existing authentication and data API
at `https://risk-review-ops.preview.emergentagent.com`. Google and email/password
sign-in use the same stored users, server roles, tenant checks, and sessions.
The static fixture adapter is no longer used by the application.

Install the frontend's declared dependencies with its existing Yarn setup, then
run `npm run build` from the repository root (or `yarn --cwd frontend build:preview`). This writes the
validated static build to `build/`, matching `.openai/hosting.json`.
`REACT_APP_BACKEND_URL` can override the test API URL. The normal frontend
`build` and `start` scripts continue to use deployment-supplied configuration.

For the supervised browser preview, use the frontend directory; its `dev` script
accepts the service's host and port arguments and supplies the same test API URL.

Manage account names, roles, and passwords through the backend. Never put account
passwords or session tokens in frontend configuration, this document, or Git.
Existing seed accounts keep their saved names and passwords across backend
startup. Seed environment credentials apply when creating an account.
