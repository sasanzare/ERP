---
type: Architecture
title: P08 Purchase Request to Warehouse Receipt
description: Defines purchase request approval, supplier order snapshots, partial receipts, and the P06 inventory integration.
tags:
  - architecture
  - purchasing
  - inventory
status: active
---

# P08 Purchase Request to Warehouse Receipt

## Scope

P08 owns organization-scoped purchase requests, independent editor approval, supplier orders, and warehouse receipts. P09 owns accounting posting. P10 owns supplier invoices, payables, and settlement. P08 creates no journal, invoice, payable, or payment record.

## Workspace and API

| Workspace | API | Purpose |
|---|---|---|
| `/purchase-requests` | `GET /api/v1/purchase-requests`, `POST /api/v1/purchase-requests` | Browse requests and create a draft with one or more exact base-unit lines. |
| `/purchase-requests/{id}` | `GET /api/v1/purchase-requests/{id}`, `POST .../submit`, `POST .../approve`, `POST .../convert` | Submit, approve, and convert the organization-owned request. |
| `/purchase-orders` | `GET /api/v1/purchase-orders` | Browse supplier orders and their current receipt status. |
| `/purchase-orders/{id}` | `GET /api/v1/purchase-orders/{id}`, `POST .../lines/{line}/receipts` | Read an order or record a partial receipt for one line. |
| — | `GET /api/v1/purchases/options` | Return active-organization suppliers, products with active base units, warehouses/locations, role capability, and current actor ID. |

All writes use the existing session, active-organization resolver, explicit CSRF token, and editor policy. Receipt writes additionally require the stock-management policy.

## Request and approval

An editor creates a draft request. The server derives the requester and organization from the authenticated session, scopes every product to the active organization, locks product and unit rows, and stores the exact positive quantity in thousandths plus product/unit label snapshots. The editor submits the draft; the server records the submitting actor and timestamp. A second authorized editor may approve it. The requester cannot approve their own request, even by calling the API directly. The server records the approver and approval timestamp.

## Supplier order conversion

An approved request converts to at most one supplier order. The supplier must be an organization-owned party with the supplier role. Each order line points to its source request line and copies the request's product, unit, and quantity snapshots. The order stores supplier labels, agreed unit prices, exact line totals, and an order total. Product names or price-list entries changed later do not rewrite the order document.

The database's `(organization_id, source_request_id)` uniqueness is the final one-order guard. Conversion is serialized by locking the request and its lines. Its payload hash covers the supplier, source-line identity, product/unit/quantity snapshots, and agreed prices. An identical retry returns the existing order; a changed supplier or price returns HTTP 409.

Purchase documents use whole Iranian rials (`IRR`, scale 0), with an agreed price per product base unit. For a stored quantity in thousandths, each line total rounds the exact quantity-times-price product half-up to a whole rial. The order total is the sum of those rounded line totals. Arithmetic uses bounded signed integer intermediates and rejects unsupported overflow. P04 price lists remain whole rials; P05 sales documents remain Toman with their existing conversion and rounding contract.

## Receipt and inventory integration

The receiver submits only warehouse, location, quantity, and an `Idempotency-Key` UUID. The product and unit come from the order line. A receipt requires that the current product base unit still matches the saved order unit; otherwise it is rejected without a movement.

The purchasing service locks purchase order → order line → product → warehouse/location. It calls P06 `StockService::postOperation` with operation type `receipt`, source-scoped idempotency metadata, and a final domain check that runs after the stable stock-key lock. It then saves the purchase receipt, inbound operation/movement links, received quantity, and any order closeout in the same transaction. The order row serializes receipts on different lines and protects closeout. An order closes only after every line is fully received.

The receipt idempotency hash binds organization, order, order line, warehouse, location, and exact quantity. Same-key/same-payload retries return the original receipt even after closeout. Reusing that key for another payload returns HTTP 409. Stock quantity and open reservation counters are updated through P06's existing movement ledger; receipt leaves reservations unchanged. Standalone P06 receipts continue to use the same route and service entry point.

## Related knowledge

- [P08 data model](../data/p08-purchasing.md)
- [P08 security](../security/p08-purchasing.md)
- [ADR-007: approval, currency, and receipt locks](../decisions/adr-007-p08-purchase-approval-and-pricing.md)
- [P06 stock workflow](p06-stock-workflow.md) and [P07 fulfillment](p07-sales-fulfillment.md)
- [README/runbook](../../../README.md) and [UI evidence](../../UI_DESIGN.md#p08-purchasing-evidence)
