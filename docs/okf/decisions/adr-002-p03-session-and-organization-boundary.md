---
type: Architecture Decision
title: P03 Session and Organization Boundary
description: Records P03's session-based access model, membership-scoped roles, and organization-owned product boundary.
tags:
  - decision
  - authentication
  - authorization
status: accepted
---

# P03 Session and Organization Boundary

## Decision

- Use Laravel's built-in session guard for same-origin browser sign-in and sign-out; include the `web` middleware group on workspace JSON routes and require an explicit matching CSRF token on every mutating route.
- Store roles on the unique user/organization membership. Resolve the active organization from current memberships and reject selections the user does not own.
- Scope product reads and writes to the active organization. Keep product code unique within one organization through a database composite unique index.
- Record membership role changes and their audit rows inside one database transaction. Do not create another audit row for an unchanged role.

## Rationale

P03 is limited to local synthetic data and one representative product write. Session cookies preserve the same-origin React architecture. Membership-scoped roles allow a user to hold different roles in different organizations, while server middleware and Laravel policies remain the authorization boundary.

## Compatibility and rollback

Forward migrations retain existing product rows and IDs, assign them to the `legacy-local` starting organization, and only then require ownership. The composite code index can be rolled back only if no code is shared across organizations; the migration checks this and refuses the rollback before changing the index.

## Related concepts

- [P03 access architecture](../architecture/authentication-and-organization-access.md)
- [Current architecture](../architecture/current-architecture.md)
- [P01 database test isolation](adr-001-p01-stack-and-isolation.md)
