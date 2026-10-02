# Shared governance catalogs

This directory is the authoritative source for framework definitions, assessment
guidance, framework Review plans, and onboarding catalogs. Content versions and
source qualifications in each catalog are unchanged by this relocation.

- The backend reads these files through `framework_catalog.ROOT`.
- The frontend imports these same files through `@catalogs/`; CRACO and Jest
  resolve that alias directly to this directory. There are no generated copies.
- The backend image copies the directory to `/app/shared/catalogs`. Build the
  image with the repository root as its Docker context.

`frameworkDefinitions.json` declares capabilities and the workspace for each
framework. Capabilities permit framework-specific fields; they do not grant
tenant access, ownership, or write permissions. Assessment authorization runs
before capability validation. CIS, SOC 2, and ISO retain their separate catalog
structures and semantics. No feature depends on a seeded client identifier.
