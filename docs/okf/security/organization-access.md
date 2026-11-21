---
type: Security Model
title: P03 Organization Access Boundary
description: Defines the local P03 session, CSRF, organization membership, and product authorization rules.
tags:
  - security
  - authorization
  - organization
status: active
---

# P03 Organization Access Boundary

## Identity and browser state

Laravel's session guard authenticates the existing user model. Login rotates the session ID and uses generic credential errors with a per-email-and-IP throttle. Logout clears the selected organization, invalidates the session, and regenerates the CSRF token. Workspace API routes use same-origin session cookies and the `web` middleware group; an explicit middleware requires a matching `X-CSRF-TOKEN` or `_token` on every mutating request, even when the request is same-origin.

## Organization authorization

The server resolves active organization access from persisted memberships on every protected request. A client-supplied ID can request a switch only after the server confirms that membership. A user with no memberships and a stale selected membership receive an explicit denial. Product and master-data queries add `organization_id` before materializing records or authorizing a write.

The `reader` role can view products and P04 registers/details. The `editor` role can update products and manage P04 master data. The UI receives capabilities for display, but Laravel policies independently enforce them. P03 name-only product PATCH remains valid; P04 adds optional code/base-unit fields. Ownership overrides are rejected.

## Audit and migration limits

Role assignment uses `MembershipRoleService`, which writes the membership and `organization_role_audits` row in the same transaction. The row contains the organization, membership, actor or explicit system source, old/new role, and timestamp. Unchanged assignments are idempotent.

Existing products are backfilled to `legacy-local` before `organization_id` becomes required. Codes may repeat between organizations but not within one. The index rollback stops before altering the schema if cross-organization duplicate codes exist.

Implementation and validation evidence is tracked in the [P03 architecture](../architecture/authentication-and-organization-access.md), [P03 browser evidence](../../UI_DESIGN.md#p03-verification-evidence), and [handoff](../../../HANDOFF.md).

## P04 relationship boundary

P04 scopes parties, units, warehouses, locations, and price lists by active organization. Product units and location warehouses must share the same organization. Price entries are scoped to one organization/list/product. Location selectors filter by warehouse, and a server endpoint rejects a mismatched pair even when both records belong to the same organization. See [P04 isolation details](p04-master-data-isolation.md) and the [P04 data model](../data/master-data.md).
