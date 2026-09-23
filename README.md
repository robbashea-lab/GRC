# Omnisciente

Multi-tenant GRC workspace: React frontend, FastAPI API and MongoDB persistence.
The published private preview intentionally supports **Explore Demo only**.
Demo is isolated session data; it is not proof of persistent authentication or backend readiness.

- [Developer handoff and safe verification](docs/developer-handoff.md)
- [Engineering health, measured limits and release blockers](docs/engineering-health-audit.md)
- [Existing staging inspection](docs/phase9-runtime-inspection.md)
- [Framework cadence-validation closure](docs/framework-cadence-closure.md)

Start with the handoff before running tests or initialization. Some historical
generated tests target an external deployment and must not be run through
unrestricted test discovery. Do not seed, reset or delete a persistent database
to make a verification pass.
