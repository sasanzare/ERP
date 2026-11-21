---
type: Security Model
title: P07 Sales Fulfillment Isolation
description: Documents active-organization lookups, editor-only fulfillment actions, foreign-ID hiding, and reservation release protection.
tags:
  - security
  - sales
  - inventory
  - authorization
status: active
---

# P07 Sales Fulfillment Isolation

## Organization scope and authorization

The authenticated P03 session and server-resolved active organization remain the ownership source. Reserve, deliver, and cancel endpoints first resolve the order and line within that organization before validating secondary request fields. Foreign or mismatched line/order IDs remain 404; reservation IDs are resolved within the same organization and line. The request cannot supply product, unit, actor, or organization ownership for a sales-order line.

Readers can open an authorized order and see line quantities, reservation history, delivery actors/times, operation IDs, and movement IDs. Editors must pass both `manageSales` and `manageStock` server policies to reserve, deliver, or cancel. UI capability flags only hide controls; they are not authorization.

Every write remains inside the authenticated `web` route group and uses explicit `X-CSRF-TOKEN` enforcement. Reserve and delivery require UUID `Idempotency-Key` headers. Unsupported body fields, including `organization_id`, are rejected.

## Linked-record validation

Product, order line, reservation, warehouse, location, operation, movement, and actor relationships are constrained to the owning organization. The product and base unit are derived from the locked line; the current base unit must equal the saved order-line unit. Warehouse/location pairs are checked under their row locks. Delivery only accepts a reservation whose `sales_order_line_id`, product, base unit, location, and organization match the requested line.

The P06 standalone reservation release route checks the locked row and returns HTTP 409 for a P07-managed reservation. Only the P07 cancellation service may release its remaining amount, keeping line cancellation and reservation accounting in one transaction. Normal P06 standalone release behavior remains available.

## Failure, retry, and concurrency boundary

Delivery operation, outbound movement, delivery trace, and reservation consumption commit or roll back together. The request hash binds the idempotency key to the order, line, reservation, and quantity; conflicting reuse returns 409. The database enforces unique organization/idempotency keys and organization-scoped relationship constraints.

P07 locks the order line first, then follows P06 product → warehouse/location → stock key → reservation ordering. Competing deliveries and cancellation serialize on the line; concurrent P06 stock writes serialize on the same stock key. Reader writes, cross-organization records, unrelated reservations, excess line quantities, excess reservation quantities, and injected delivery failures leave balances and links unchanged.

See [P05 sales isolation](p05-sales-isolation.md) and [P06 stock isolation](p06-stock-isolation.md).
