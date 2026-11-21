---
type: Security Model
title: P06 Stock Organization Isolation and Write Authorization
description: Defines P06 active-organization scoping, editor/read-only permissions, pair validation, and transaction locks.
tags:
  - security
  - inventory
  - organization
  - authorization
status: active
---

# P06 Stock Organization Isolation and Write Authorization

## Ownership and roles

The authenticated P03 session and active membership are the ownership source. The API does not accept an `organization_id` override. Product, warehouse, location, stock operation, movement, reservation, and balance reads are scoped to the active organization before serialization or mutation. Foreign product, warehouse, location, and reservation IDs are returned as not found without foreign values.

Readers can load stock options and view balances, movement history, and reservations. Editors can post opening/receipt/issue/transfer operations, create standalone reservations, and release those reservations. Laravel `manageStock` authorization runs independently of UI capability visibility. Every mutation requires the existing explicit `X-CSRF-TOKEN` check inside the session-authenticated `web` route group. P07 actions also require `manageSales`; the P06 release route rejects a line-managed reservation with HTTP 409.

## Relationship validation

Every operation request supplies a warehouse and location. Transfers also supply a destination warehouse/location pair. The service scopes each ID, locks its row, and confirms that the chosen location belongs to the chosen warehouse, including when both warehouses belong to the same organization. A missing or cross-organization ID is hidden as 404; a same-organization pair mismatch is a validation error. Rejected writes do not append movements or reservations.

Products without a base unit cannot enter stock. A product's base unit and a location's warehouse cannot be changed after a stock key has been recorded. Both update paths take the corresponding product/location row lock used by stock writers, preventing a concurrent edit from changing the meaning or ownership of a stock key.

## Concurrency and failure boundaries

P06 writers lock the product row, then sorted warehouse/location rows, then stable stock-key registry rows in ascending location order. P07 first locks its order line, then follows that P06 stock order and locks linked reservation rows afterward. Missing registry rows are inserted inside the transaction before `SELECT ... FOR UPDATE`. Under the stock-key lock, the service reads current movement legs and open reservation outstanding amounts with locking reads. Transfer legs, reservations, releases, and P07 delivery/cancellation effects are atomic; deadlock victims retry up to three times. Unique per-organization idempotency keys prevent duplicate successful operation/reservation/delivery writes on retry. The application has no path that edits or deletes posted movement history.

See [P03 organization access](organization-access.md), [P06 workflow](../architecture/p06-stock-workflow.md), and [P06 data equations](../data/p06-stock-balances.md).
