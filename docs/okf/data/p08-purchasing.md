---
type: Data Model
title: P08 Purchase Requests, Orders, and Receipts
description: Records request and order snapshots, whole-rial price fields, quantity reconciliation, and immutable receipt links.
tags:
  - data
  - purchasing
  - inventory
status: active
---

# P08 Purchase Requests, Orders, and Receipts

## Purchase requests

`purchase_requests` belongs to one organization and stores a generated request code, title, lifecycle state, requester, submitter/time, and approver/time. `purchase_request_lines` belongs to a request and records its organization-scoped product, saved base unit, exact `quantity_milli`, and product/unit code/name/symbol snapshots. Requests are created with at least one positive quantity line. Their default state is `draft`; transitions are server-owned.

## Supplier orders and monetary snapshots

`purchase_orders` has one unique source request per organization, a supplier party and supplier code/name snapshot, state, order time, creator, closed time, currency code/scale, rounding rule, exact whole-rial total, and conversion hash.

`purchase_order_lines` links each source request line and keeps product, unit, ordered quantity, and product/unit snapshots. It stores `received_quantity_milli`, whole-rial `unit_price_rial`, and whole-rial `line_total_rial`. All amounts are returned as decimal strings to avoid floating-point conversion. The order's `total_rial` is the exact sum of its rounded line totals.

Currency and arithmetic contract:

- Currency: Iranian rial, `IRR`, scale 0; P08 does not convert to Toman.
- Unit price: nonnegative whole rials per saved base unit. A zero agreed price is representable.
- Quantity: the P06-compatible integer thousandth of the saved unit.
- Line total: exact `quantity_milli × unit_price_rial`, divided by 1000 and rounded half-up to the nearest whole rial, once per line.
- Order total: sum of already-rounded line totals; no second order-level rounding.
- Unsupported price, intermediate, or total overflow is rejected. No floating-point arithmetic is used.

P04 list-price rows remain whole rials. P05 quote/order price, discount, and total rows remain Toman; P08 does not change either existing contract.

## Receipts and stock trace

`purchase_receipts` links the organization, purchase order, order line, warehouse/location, actor, exact quantity, UUID idempotency key/request hash, and immutable inventory operation/movement IDs. Receipt-time warehouse and location code/name snapshots preserve the receiving destination label. Composite foreign keys bind the receipt to the same organization and ensure its movement belongs to its linked operation.

The order line stores cumulative received thousandths. Its remaining amount is `ordered_quantity_milli - received_quantity_milli`. The parent order is open while any line has positive remaining quantity and closes once all lines are fully received. Each receipt adds one P06 inbound movement; it does not modify reservation records.

## Constraints and history

Forward migration `2026_11_21_000009_create_p08_purchase_tables` creates the five P08 tables without altering P01–P07 rows. Organization-scoped composite foreign keys cover request/product/unit, order/request/supplier, order-line/source-line/product/unit, and receipt/order/line/location/operation/movement relationships. Unique constraints enforce one purchase order per source request, one source request line per order, and one receipt per organization/idempotency key, operation, and movement.

See [P08 architecture](../architecture/p08-purchasing.md), [P08 security](../security/p08-purchasing.md), [P06 stock data](p06-stock-balances.md), and [ADR-007](../decisions/adr-007-p08-purchase-approval-and-pricing.md).
