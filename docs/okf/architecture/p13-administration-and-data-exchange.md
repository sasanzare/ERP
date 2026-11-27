---
type: Architecture
title: P13 Administration and Party Data Exchange
description: Documents the local membership-role administration and organization-scoped party import/export workflows.
tags:
  - architecture
  - administration
  - data-exchange
  - organization
status: accepted
---

# P13 Administration and Party Data Exchange

## Scope

P13 adds an organization-scoped membership role editor and audit view, plus CSV/XLSX import and filtered CSV export for the P04 party register. It remains local development only and uses the existing session, active-organization middleware, explicit CSRF middleware, and P03/P04 policies. P13 does not alter P10 posting or add external services.

## Routes

| Workspace/API route | Method | Authorization | Purpose |
|---|---|---|---|
| `/administration/memberships` | GET | Role manager for the active organization | Review current memberships, change roles, and open scoped history. |
| `/api/v1/organization/memberships` | GET | `viewMembershipRoles` | List active-organization members and current role-manager indicators. |
| `/api/v1/organization/memberships/{id}/role-history` | GET | `viewMembershipRoleHistory` | Read actual before/after events for one scoped membership. |
| `/api/v1/organization/memberships/{id}/role` | PATCH | `manageMembershipRoles` + explicit CSRF | Change an existing reader/editor membership with an expected-role check. |
| `/api/v1/parties/import/template` | GET | P04 register reader | Download the UTF-8 CSV header template. |
| `/api/v1/parties/import/preview` | POST | P04 editor + explicit CSRF | Parse and classify rows without writing records. |
| `/api/v1/parties/import/apply` | POST | P04 editor + explicit CSRF | Create reviewed valid rows with stable retries and durable outcomes. |
| `/api/v1/parties/export` | GET | P04 register reader | Stream the full matching active-organization register. |

## Membership role workflow

P03 already records role assignment through `MembershipRoleService` and `organization_role_audits`, but normal editor capability does not grant authority to change users. P13 adds an independent `organization_role_managers` grant. Local/testing CLI commands explicitly grant or revoke it. The policy grants that manager access only to membership management/history; operational P04 write permission still comes from the editor role.

Role changes resolve a membership inside the active organization before validating role fields. The service locks the organization and membership, rechecks the role-manager grant, compares `expected_role` with the locked current value, and writes membership plus audit in one transaction. A stale role returns 409. An unchanged role is idempotent and adds no event. `ResolveActiveOrganization` reloads the persisted role on the next protected request, and `/api/v1/workspace` returns the refreshed operational and role-manager capabilities.

Self-change is allowed. A role-manager may change their own operational role; the separate manager grant persists. Revoking a grant is a local CLI operation that locks the organization and refuses to remove its last manager.

## Party data exchange

One normalized row shape is produced by both CSV and XLSX adapters. The template headers are `party_id,party_code,display_name,roles`; the optional source party ID is informational and ignored for create-only behavior. The first visible XLSX worksheet is selected. Formula cells are rejected. CSV is UTF-8 with optional BOM, comma-delimited, and uses standard doubled quotes. `roles` accepts `customer`, `supplier`, or `customer|supplier`. Limits are 5 MiB and 1,000 nonblank data rows. XLSX code cells must be text to preserve leading zeros.

Preview validates P04 field limits, classifies valid/duplicate/invalid rows, and checks duplicate codes using the `parties.code` database collation plus current organization rows. Preview issues only reads. Apply binds the active organization, UUID `Idempotency-Key`, and hash of the normalized rows. A changed payload under the same key returns 409. Existing codes are skipped without modifying party data or role rows. Each accepted party and its roles commit atomically with its row outcome; pending rows resume on retry. The existing unique `(organization_id, code)` index remains the concurrent-write guard.

Export uses the same `PartyRegisterQuery` search and role filters as the API register, derives the organization only from the session, orders by display name then ID, and streams `party_id,party_code,display_name,roles`. It includes a UTF-8 BOM, RFC-style field quoting, and prefixes formula-like text with an apostrophe. Numeric-looking code text is unchanged in the file; Excel users should set `party_code` to Text when importing a CSV.

## UI composition

The existing Persian RTL workspace remains the command layer. The membership table and party register are the focal content surfaces; the manager-policy note and import preview/results stay grouped on solid, high-contrast panels. Shared glass buttons, toolbar, sidebar, and mobile dock remain the only glass controls on the P13 screens. See [P13 UI acceptance evidence](../../UI_DESIGN.md#p13-administration-and-data-exchange-evidence).

## Related concepts

- [P13 data model](../data/p13-administration-and-data-exchange.md)
- [P13 access boundaries](../security/p13-administration-and-data-exchange.md)
- [ADR-009: separate role-manager grant](../decisions/adr-009-p13-role-management.md)
- [P03 organization access](../security/organization-access.md)
- [P04 master-data isolation](../security/p04-master-data-isolation.md)
- [Local runbook](../../../README.md)
