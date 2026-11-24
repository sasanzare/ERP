---
type: Architecture
title: P10 Customer and Supplier Settlement
description: Describes the user-approved local P10 MVP invoice, open-item, treasury, allocation, and P09 journal integration.
tags:
  - architecture
  - settlements
  - accounting
status: active
---

# P10 Customer and Supplier Settlement

## Scope and approval boundary

P10 connects P05 sales orders and P07 delivery events to customer invoices/receivables, and P08 purchase orders/warehouse receipts to supplier invoices/payables. It records receipts and payments as P10 treasury movements, allocates each movement to an open item, and posts a linked P09 journal in the same database transaction. It does not change P05/P08 source snapshots or create inventory movements.

The local ERP MVP workflow was approved on 2026-11-24 and is limited to the existing organization 1 / book 2 mapping recorded in [ADR-008](../decisions/adr-008-p09-accounting-scope-and-posting-decisions.md). That profile remains `synthetic_test` and is available only in `local` or `testing`. No live/production profile was approved or activated; real source posting remains disabled.

## Workflow

An editor explicitly submits an invoice for one confirmed sales order or one purchase order, with one or more P07 deliveries or P08 receipts on its lines. Only delivered or received, not-yet-billed quantities are eligible; partial billing is allowed while cumulative invoicing stays within source quantity. The editor supplies effective and due dates, and the effective date must fall in an open period. The service verifies records inside the active organization, locks the accounting book before the source order and sorted source lines/events, then checks invoiceable quantity while holding source rows.

Customer line amounts come from the persisted P05 whole-toman line snapshot, split by cumulative delivered quantity with integer half-up rounding, then converted by exactly ten to whole rials. Supplier line amounts come from P08 whole-rial unit-price snapshots and cumulative received quantity; cumulative rounding prevents splitting a receipt from increasing the line snapshot total. These are the approved local MVP rules. Local invoices use zero tax; supplier invoice debit uses the mapped fixture purchase-expense account and does not capitalize inventory or post COGS.

Posting the invoice, its P09 journal, and its open item is atomic. A customer receipt or supplier payment locks the book, invoice, and open item, verifies the current balance, then writes the P10 treasury movement, P09 journal, and allocation atomically. The approved local MVP fully allocates one movement to one invoice. It does not record unallocated advances or split one movement across several invoices. New postings in a closed period are rejected, while exact-key retries return the persisted record without changing balances.

P10 P09 source types use the `p10.*` namespace. The generic P09 reversal route rejects those journals so a journal cannot be reversed while leaving the invoice or allocation effective. The local MVP has no edit/delete/void or coordinated correction route; corrections require a separate future decision. Production posting remains disabled.

## HTTP surface

| Method and path | Purpose |
|---|---|
| `GET /api/v1/settlements/options` | Read eligible delivered/received source quantities, books, and posting readiness. |
| `GET /api/v1/settlements/invoices?direction=customer\|supplier` | Read scoped invoices, balances, source links, allocations, treasury movements, and journals. |
| `POST /api/v1/settlements/sales-orders/{id}/customer-invoices` | Atomically post a customer invoice from P07 delivery quantities. |
| `POST /api/v1/settlements/purchase-orders/{id}/supplier-invoices` | Atomically post a supplier invoice from P08 receipt quantities. |
| `POST /api/v1/settlements/customer-invoices/{id}/receipts` | Record and fully allocate a customer receipt. |
| `POST /api/v1/settlements/supplier-invoices/{id}/payments` | Record and fully allocate a supplier payment. |

All writes require the authenticated active-organization session, editor authorization, explicit CSRF token, and a UUID `Idempotency-Key`. Exact retries return the original records; changed payloads under the same key return conflict.

See [P10 data](../data/p10-settlement.md), [P10 security](../security/p10-settlement.md), [P07 fulfillment](p07-sales-fulfillment.md), [P08 purchasing](p08-purchasing.md), and [P09 accounting](p09-accounting.md).
