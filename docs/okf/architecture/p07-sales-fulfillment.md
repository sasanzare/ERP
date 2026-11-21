---
type: Architecture
title: P07 Confirmed Sales-Order Fulfillment
description: Defines the organization-scoped workflow that reserves stock for a confirmed order line, posts partial outbound deliveries, and cancels its remaining quantity.
tags:
  - architecture
  - sales
  - inventory
  - workflow
status: active
---

# P07 Confirmed Sales-Order Fulfillment

## Scope

P07 connects confirmed P05 sales-order lines to P06 stock reservations and outbound inventory issues. It supports partial delivery, full remainder cancellation, and a readable history from the order detail. Returns, purchasing, valuation, invoices, and accounting remain outside scope.

## Routes and response

| Workspace | API | Purpose |
|---|---|---|
| `/orders/{id}` | `GET /api/v1/sales-orders/{order}` | Show the unchanged commercial order snapshots plus ordered, reserved, delivered, cancelled, and pending line quantities. |
| Order-line Reserve | `POST /api/v1/sales-orders/{order}/lines/{line}/reservations` | Reserve a positive exact quantity at a selected active-organization warehouse/location. Product and unit come from the locked order line. |
| Order-line Deliver | `POST /api/v1/sales-orders/{order}/lines/{line}/deliveries` | Post one partial issue from an active reservation linked to that line. Requires UUID `Idempotency-Key`. |
| Order-line Cancel Remainder | `POST /api/v1/sales-orders/{order}/lines/{line}/cancel-remainder` | Release all linked outstanding reservations and cancel the full unfulfilled line remainder. Repeating it has no additional effect. |

Each order line returns `fulfillment` with exact three-decimal strings, all linked reservation counters, delivery actors/timestamps, and the associated `inventory_operations` and `inventory_movements` IDs. The Persian order detail links each delivery to `/stock/movements#operation-{id}` and `/stock/movements#movement-{id}`.

## Transaction and locking flow

P07 first locks the organization-scoped sales-order-line row. Its stock action then follows the P06 order: lock product; lock sorted warehouse/location rows; insert and lock the stable stock-key row; take current locking reads of ledger/reservation rows; then lock the selected reservation. Cancellation releases multiple linked reservations in ascending location ID and reservation ID order. P06 standalone writers never wait on an order line, and P06 release locks stock before rejecting line-managed reservations, so the cross-module order does not introduce a reverse lock edge.

Reservation checks the order-line remaining quantity, active linked holds, current product base unit, selected warehouse/location pair, and available physical stock in the same transaction. A line whose saved unit differs from the current product base unit receives a Persian validation error.

Delivery creates one `issue` operation, one immutable outbound movement, one delivery trace, and an equal increase to the reservation's consumed counter in one database transaction. It validates against reservation outstanding quantity and physical quantity; it does not compare the issue with unreserved available stock. Therefore delivery remains possible when the stock key is fully reserved and `available = 0`, while other reservations remain held.

The stable acquisition order is `sales_order_line → product → warehouse/location → stock key → reservation`. The line lock serializes reserve, delivery, and cancellation for one line. The stock-key lock also serializes P07 against P06 issue, reservation, and release work. Laravel retries deadlock victims up to three times.

## Retry and quantity rules

Every reserve and delivery request uses the existing P06 UUID idempotency convention. The delivery request hash includes order, line, reservation, and quantity. The same key and payload return the persisted delivery and operation; the same key with a different payload returns HTTP 409. Database uniqueness on the inventory operation and delivery keys prevents duplicate issues.

All quantities remain decimal strings with up to three fractional digits and integer thousandths internally. For each reservation:

```text
outstanding = original quantity - consumed quantity - released quantity
```

For each order line:

```text
delivered = sum(linked delivery quantities)
pending = ordered - delivered - cancelled
```

Cancelling the line records the whole current `pending` quantity on the line and releases each linked reservation's `outstanding` amount. It creates no inventory movement and preserves all completed deliveries.

## UI composition

The order detail keeps the P05 Lens Inspector / Mobile Focus Sheet shell. The commercial snapshot stays the focal document; compact quantity metrics form the secondary group; Reserve, Deliver, and Cancel Remainder stay inside the relevant line card. Shared Liquid Glass buttons and forced-fallback styles are reused. Decimal inputs remain text fields with decimal keyboards and visible keyboard focus.

## Verification

The guarded serial suite passed 55 tests / 565 assertions after the P07 migration was rolled back and reapplied on `erp_test`. The P07 Chrome harness passed the exact synthetic path at 1280×900 and 390×844, keyboard focus, retry/conflict checks, two-connection delivery contention, zero horizontal overflow, forced bright fallback, and zero browser runtime errors. The canonical balance snapshots were `10.000/0.000/10.000`, `10.000/3.000/7.000`, `8.000/1.000/7.000`, and `8.000/0.000/8.000` (physical/reserved/available). Evidence is in [UI_DESIGN.md](../../UI_DESIGN.md#p07-sales-fulfillment-evidence) and the current state in [HANDOFF.md](../../../HANDOFF.md).

See [P07 data](../data/p07-sales-fulfillment.md), [P07 isolation](../security/p07-sales-fulfillment.md), [P06 stock workflow](p06-stock-workflow.md), and [ADR-006](../decisions/adr-006-p07-reserved-sales-order-issues.md).
