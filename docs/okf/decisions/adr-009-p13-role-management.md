---
type: Decision
title: ADR-009 P13 Separate Membership Role Manager
description: Records the local decision to separate authority to change membership roles from operational editor access.
tags:
  - decision
  - authorization
  - membership
  - local-development
status: accepted
---

# ADR-009: Separate Membership Role Manager for P13

## Status

Accepted for the local-development ERP prototype on 2026-11-27. This decision does not authorize a production identity or administration design.

## Context

P03 already stores per-organization `reader`/`editor` roles and appends `organization_role_audits` when `MembershipRoleService` changes a role. `OrganizationPolicy` uses `editor` to authorize operational master-data and workflow writes. Giving every editor the ability to grant editor access would merge operational work with access administration.

## Decision

P13 represents membership role-management authority as an explicit organization/user grant in `organization_role_managers`, constrained to an existing membership. The grant authorizes membership listing, role changes, and scoped role-history reads. It is distinct from `reader`/`editor` and is provisioned only through local/testing CLI commands. A local revoke is rejected if it would remove the organization's last role manager.

Role changes use `MembershipRoleService`, lock and recheck the active-organization target and manager grant, compare the expected current role, and append membership + audit atomically. No-op submissions add no audit row. Self-change is permitted; changing one's operational role does not remove the separate role-manager grant. The next protected request resolves the new role from persisted membership data.

## Rationale and consequences

The local workflow can grant the narrow authority to a selected synthetic account without making ordinary editors administrators. The existing audit table remains the source of truth for role changes. The grant itself remains a local provisioning record and does not create a web UI for granting more administrators. Production would need a separately reviewed identity, approval, grant-audit, and recovery design.

## Related concepts

- [P13 role-management security](../security/p13-administration-and-data-exchange.md)
- [P13 administration architecture](../architecture/p13-administration-and-data-exchange.md)
- [P03 organization access](../security/organization-access.md)
- [ADR-002 session and organization boundary](adr-002-p03-session-and-organization-boundary.md)
