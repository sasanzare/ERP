---
type: Security Model
title: P13 Membership Administration and Party Exchange Boundaries
description: Defines the independent local role-manager permission and active-organization boundaries for membership and party exchange routes.
tags:
  - security
  - authorization
  - organization
  - data-exchange
status: accepted
---

# P13 Membership Administration and Party Exchange Boundaries

## Membership role authority

Session auth and `ResolveActiveOrganization` remain mandatory on all P13 routes. A role manager grant is scoped to an existing membership by the database composite foreign key. `OrganizationPolicy::viewMembershipRoles`, `manageMembershipRoles`, and `viewMembershipRoleHistory` require that grant. An ordinary editor can still manage P04 business records but cannot list members, change their roles, or read role history. A reader without the explicit grant is also denied.

The role update resolves the target membership inside the active organization before request validation, preserving 404 parity for foreign and unknown membership IDs. It authorizes the actor, locks the organization and membership, rechecks the role-manager grant and expected current role, then updates the membership and appends the audit event in one transaction. Stale writes return 409; no-op writes produce no audit event. A self-change is allowed and takes effect on the subject's next protected request. The independent role-manager grant persists through an editor/reader change. Local CLI revocation locks the organization and cannot remove the last manager.

## Party import and export

P04 readers may use the template and export; P04 editors may preview and apply imports. Writes retain the existing web session and explicit CSRF requirements. The server never accepts an organization selector for party export or import: it derives tenant scope from the active session. A supplied `organization_id` on import/export is rejected.

Preview performs validation and read-only, database-collation duplicate checks without writing party, role, import, or result records. Apply rechecks editor authorization for each pending row and checks current uniqueness. Party and all roles for one accepted row are atomic. The organization-scoped database unique index blocks concurrent duplicate codes; the importer converts that race to a durable duplicate outcome without modifying the winning record.

XLSX import rejects formula cells and numeric party-code cells to avoid evaluating formulas or losing leading zeros. CSV export apostrophe-prefixes formula-like cells. The export uses the same active-organization search and role predicates as the register and stable ID tie-breaking; an organization ID supplied as a query parameter is rejected.

## Related concepts

- [P13 architecture](../architecture/p13-administration-and-data-exchange.md)
- [P13 data model](../data/p13-administration-and-data-exchange.md)
- [P03 organization access](organization-access.md)
- [P04 master-data isolation](p04-master-data-isolation.md)
- [ADR-009](../decisions/adr-009-p13-role-management.md)
