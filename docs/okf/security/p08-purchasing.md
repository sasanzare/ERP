---
type: Security Model
title: P08 Purchasing Organization Isolation and Approval
description: Defines purchase request/order/receipt scope, role enforcement, no-self-approval policy, and idempotent inventory writes.
tags:
  - security
  - purchasing
  - organization
  - authorization
status: active
---

# P08 Purchasing Organization Isolation and Approval

## Session and role boundary

The authenticated P03 session and active organization membership are the ownership source. P08 APIs do not accept an `organization_id` override. Members can read their organization's purchase options, requests, orders, and receipt history. Editors can create and submit requests, approve requests subject to the separate-approver rule, convert approved requests, and receive order lines. Receipt writes also require the existing `manageStock` editor policy. Every mutation uses the session-authenticated `web` group and explicit `X-CSRF-TOKEN` middleware.

## Separate approval

The requester is derived from the authenticated actor and saved with the draft. The server denies approval when the current actor ID equals `requester_id`, even if the requester is an editor. A different authorized editor may approve only a submitted request. Reader and non-member writes fail authorization; unknown and cross-organization request, supplier, product, order, line, warehouse, and location IDs are hidden as 404. The API records approval actor/time and leaves transition fields unchanged on denial.

## Relationship and unit checks

Request product IDs are resolved inside the active organization before unit validation. Conversion scopes the supplier before checking its supplier role; a same-organization party without the supplier role receives validation feedback, while a foreign party is hidden. Receipt routes resolve the organization-owned order and line before receiving-field validation. The submitted warehouse and location are then scoped and the location/warehouse pair is checked. Product and unit are never accepted from receipt input; the server derives them from the locked order line and rejects a changed current product base unit.

## Retry, locking, and atomicity

Conversion locks the source request and lines, enforces the unique request/order relation, and compares a payload hash before returning an existing order. Changed supplier or price input conflicts rather than overwriting the stored snapshot.

Receipt uses an organization-scoped UUID key and a hash of order line, warehouse, location, and exact quantity. The lock order is purchase order → order line → product → warehouse/location → P06 stock key. Outstanding quantity, order state, and unit compatibility are rechecked after stock locking. Receipt, P06 inbound operation/movement, received counter, and closeout commit together. A replay after closeout returns the same receipt and stock trace; a changed payload conflicts. P06 standalone receipt continues to enforce its own active-organization and CSRF/editor rules.

See [P08 workflow](../architecture/p08-purchasing.md), [P08 data](../data/p08-purchasing.md), [P06 isolation](p06-stock-isolation.md), and [organization access](organization-access.md).
