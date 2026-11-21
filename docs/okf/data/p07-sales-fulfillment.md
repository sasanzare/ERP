---
type: Data Model
title: P07 Sales Fulfillment Records
description: Defines order-line cancellation counters, line-owned reservations, and immutable delivery links to stock issues.
tags:
  - data
  - sales
  - inventory
  - fulfillment
status: active
---

# P07 Sales Fulfillment Records

## Persisted changes

P07 migration `2026_11_21_000008_add_p07_sales_fulfillment` extends existing records without changing P05 commercial snapshots or the P06 ledger key:

| Record | Added fields or relationship | Meaning |
|---|---|---|
| `sales_order_lines` | `cancelled_quantity_milli`, `cancelled_by`, `cancelled_at` | One line-locked cancellation records the full then-pending quantity and actor/time. Delivered quantities remain derived from deliveries. |
| `stock_reservations` | nullable `sales_order_line_id`, `consumed_quantity_milli`, `released_quantity_milli` | Keeps the original `quantity_milli`; optional line ownership distinguishes P07 holds from standalone P06 reservations. |
| `sales_order_deliveries` | line, reservation, issue operation, outbound movement, quantity, key/hash, actor, timestamp | One immutable row for every successful partial delivery. Composite organization constraints keep the trace within one organization; the movement FK ties it to its operation. |

The migration also adds an organization/operation/movement composite key so a delivery's immutable movement must belong to its linked issue operation.

## Quantity reconciliation

All persisted operational quantities use P06 integer thousandths. The API serializes them with exactly three decimals. The reservation's source quantity is never overwritten:

```text
reservation outstanding = quantity_milli - consumed_quantity_milli - released_quantity_milli
```

Only `status = open` outstanding amounts contribute to reserved balance. A reservation is `consumed` when all of its original quantity has been delivered, `released` when cancellation released its remaining amount, and `open` while any amount is still held.

The order-line fulfillment view derives:

```text
ordered   = sales_order_lines.quantity × 1000
delivered = sum(sales_order_deliveries.quantity_milli)
cancelled = sales_order_lines.cancelled_quantity_milli
pending   = ordered - delivered - cancelled
reserved  = sum(outstanding of linked open reservations)
```

Application invariants require `0 <= delivered + cancelled <= ordered` and `0 <= reserved <= pending`. Reservation creation cannot exceed the unreserved pending amount. Delivery cannot exceed either reservation outstanding or line pending. Balances remain derived from movements and open reservation outstanding; no cached totals are added.

## Trace and snapshot boundary

Each delivery retains the line, reservation, operation, movement, exact quantity, actor, timestamp, idempotency key, and request hash. P06 `inventory_operations` remains an `issue` header and P06 `inventory_movements` remains an immutable `outbound` leg. Commercial price, discount, label, source quote, and line total snapshots remain owned by P05 and are not recalculated by fulfillment.

Cancellation adds no movement. It adds the current unfulfilled quantity to the line cancellation counter and changes each linked reservation's released counter/actor/time. Repeating cancellation preserves the original cancellation timestamp and does not append another release or issue.

See [P05 sales documents](p05-sales-documents.md) and [P06 stock balances](p06-stock-balances.md).

## Migration and validation

Forward migration `2026_11_21_000008_add_p07_sales_fulfillment` applied to the existing `erp_dev` schema without resetting its volume. On guarded `erp_test`, P07-only rollback removed the delivery table, cancellation/link/counter fields, and P07 movement key; the P06 stock tables and P06 operation foreign key remained. Reapply succeeded, and the final guarded suite passed 55 tests / 565 assertions. The migration down path restores P06's operation-key support index before reinstating its foreign key.
