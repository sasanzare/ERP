---
type: Architecture
title: P06 Stock Operations and Reservations
description: Defines standalone stock operations, exact location balances, reservations, and the P07 handoff boundary.
tags:
  - architecture
  - inventory
  - workflow
status: active
---

# P06 Stock Operations and Reservations

## Scope

P06 owns standalone opening stock, receipts, issues, location transfers, and location-specific reservations/releases. It does not attach stock actions to sales-order lines, purchase orders, valuation, or accounting. P07 owns reservation/delivery links to confirmed sales-order lines, partial delivery, and release of an unfulfilled remainder.

## Workspace and API

| Workspace | API | Purpose |
|---|---|---|
| `/stock` | `GET /api/v1/stock/balances`, `GET /api/v1/stock/options` | Read the live physical/reserved/available quantities and scoped product/location selectors; editors post operations. |
| `/stock/movements` | `GET /api/v1/stock/movements` | Read immutable operation history, including both legs of a transfer under one operation reference. |
| `/stock/reservations` | `GET /api/v1/stock/reservations`, `POST /api/v1/stock/reservations` | Read reservations or create a standalone location reservation. |
| — | `POST /api/v1/stock/operations` | Post `opening`, `receipt`, `issue`, or `transfer`. |
| — | `POST /api/v1/stock/reservations/{id}/release` | Release the complete open reservation; repeated release is idempotent. |

All APIs use session authentication, server-resolved active-organization middleware, and explicit CSRF tokens on writes. Readers may view their organization's balances, operations, and reservations. Editors may post operations, create reservations, and release reservations. The backend enforces the role even when UI controls are hidden.

## Transaction flow

The service locks the product row first, which also prevents the base unit from changing during a stock write. It then locks the selected warehouses and locations in ascending ID order, verifies every warehouse/location pair, and inserts any missing `stock_locks` rows before locking affected stock keys in ascending location ID order. This supplies a persistent row to lock even when a stock key has never been used.

After the stock-key lock is held, the service reads ledger and open-reservation rows with locking reads. MariaDB therefore supplies the latest committed values rather than a stale repeatable-read snapshot. Availability checks, the operation/reservation write, and every movement leg occur in one transaction. Laravel retries deadlock victims up to three times. An exception or failed second transfer leg rolls back the operation and all legs. The lock registry row, when created in the same transaction, also rolls back on failure.

Every operation and reservation create request requires an `Idempotency-Key` UUID. An identical retry returns the original record; a reused key with a different payload returns conflict. No update or delete API exists for posted operations or reservations; release is a one-way, idempotent transition.

## P07 interface

The P07 migration adds nullable `stock_reservations.sales_order_line_id` for line-owned holds, without changing standalone reservation behavior. `sales_order_deliveries` records each partial delivery against its reservation, issue operation, and outbound movement. P06 deliberately does not accept order-line IDs on its standalone routes; its release route returns conflict for a line-managed reservation so line reconciliation must go through P07. These links do not change the P06 ledger key or quantity representation.

See [P06 stock data](../data/p06-stock-balances.md), [P06 isolation](../security/p06-stock-isolation.md), [P07 fulfillment](p07-sales-fulfillment.md), [ADR-005](../decisions/adr-005-p06-stock-ledger-and-locks.md), and the [UI verification evidence](../../UI_DESIGN.md#p06-verification-evidence).
