---
type: Architecture Decision
title: P07 Reserved Sales-Order Issues and Lock Order
description: Records how confirmed sales-order lines use P06 reservations and immutable issues for partial delivery and remainder cancellation.
tags:
  - decision
  - sales
  - inventory
  - concurrency
status: accepted
---

# ADR-006: P07 Reserved Sales-Order Issues and Lock Order

## Decision

- Keep confirmed order quantity and commercial snapshots in P05. Derive delivered quantity from immutable P07 delivery rows and record canceled quantity separately on the line.
- Add nullable `stock_reservations.sales_order_line_id` to distinguish P07 reservations. Preserve each reservation's original quantity and track `consumed_quantity_milli` and `released_quantity_milli` as separate counters.
- Represent each successful delivery with one `sales_order_deliveries` row that links one sales-order line, one linked reservation, one P06 `issue` operation, and its outbound movement.
- Post operation, movement, delivery trace, and reservation consumption in one transaction. A reserved delivery may use physical stock even when unreserved availability is zero; it consumes only the selected reservation and delivered quantity.
- Make delivery idempotency operation-scoped and payload-bound. Repeating the same key and payload returns the saved operation/delivery; a changed payload returns 409. Enforce uniqueness in MariaDB.
- Cancel the line's entire pending remainder under the line lock, release every linked outstanding reservation, store actor/time/canceled quantity, and create no stock movement. Repeated cancellation does not change history or timestamps.
- Use lock order `sales_order_line → product → sorted warehouse/location rows → stock key → reservation`. P06 standalone reservation release refuses line-managed reservations, while standalone P06 semantics remain intact.

## Rationale

P05 order lines are immutable commercial snapshots, while P06 owns stock movement history and exact thousandth quantities. Dedicated relation rows preserve multiple partial deliveries without changing either domain's existing record shape. Explicit reservation counters explain how each held amount was consumed or released while keeping the original hold quantity auditable. A line-first lock serializes reserve, delivery, and cancellation; following P06's stock lock order then coordinates with standalone stock writes without introducing reverse dependencies.

## Consequences

The P07 schema is additive and organization-scoped. The order detail derives ordered/reserved/delivered/cancelled/pending quantities from its line, reservation, and delivery records. P06 balances subtract only open reservation outstanding amounts. Cancellation releases stock but never creates an inbound movement. Procurement, returns, valuation, invoicing, accounting, and external integrations remain outside P07.

The down migration removes P07's delivery table, line fields, reservation link/counters, and movement key. It restores the P06 operation foreign key's supporting index first. The P07-only rollback/reapply was verified on guarded `erp_test`; P03–P06 migrations and inventory tables remained applied.

## Verification evidence

The canonical local journey produced `10.000/0.000/10.000 → 10.000/3.000/7.000 → 8.000/1.000/7.000 → 8.000/0.000/8.000` (physical/reserved/available). Two MariaDB connections contending with the same delivery key returned 201/200 and one delivery. The full guarded suite passed 55 tests / 565 assertions; Chrome passed 1280×900, 390×844, keyboard focus, forced fallback, and zero runtime errors. See the [UI evidence](../../UI_DESIGN.md#p07-sales-fulfillment-evidence).
