---
type: Data Model
title: P10 Invoices, Open Items, Treasury, and Allocations
description: Defines exact Rial P10 records and source/journal links used for customer receivables and supplier payables.
tags:
  - data
  - settlements
  - accounting
status: active
---

# P10 Invoices, Open Items, Treasury, and Allocations

## Invoice and source lines

`p10_invoices` is direction-independent (`customer` or `supplier`) and stores organization/book/party, a stable code, effective and due dates, exact whole-Rial amount, source order, posting state, P09 journal, actor/timestamp, UUID retry key, request hash, and a separate P09 posting key. A successful invoice has exactly one source order type and one posted journal. Draft rows are transaction-local while the source lines and P09 journal are assembled; a failed transaction leaves no invoice.

`p10_invoice_lines` stores immutable item/unit snapshots, exact quantity thousandths, amount in whole rials, and either a sales-order-line/P07-delivery link or a purchase-order-line/P08-receipt link. The P07 delivery retains its separate inventory operation and movement IDs; the P08 receipt is explicitly labeled as a warehouse receipt. Organization-scoped foreign keys enforce that each event belongs to the linked source line.

Customer line values retain the source amount in whole Toman and convert by exact `×10` to whole Rial. When a source line is billed in parts, each amount is the difference between the rounded cumulative source total before and after the billed quantity; the final full quantity sums to the persisted P05 line snapshot. Supplier values use the P08 whole-Rial unit price and cumulative received quantity with P08 half-up rounding; no floating-point arithmetic is used. Unsupported quantity precision and signed-integer overflow are rejected.

## Open items and settlements

Each posted invoice creates one `p10_open_items` row containing direction, party, book, original amount, currency, effective date, and due date. The current balance is derived as `original_amount_rial - sum(valid_allocations.amount_rial)`; invoices and allocations are not edited to store a mutable balance.

`p10_treasury_movements` records either `customer_receipt` or `supplier_payment`, with the party, mapped treasury account, effective date, amount, optional reference, retry key/hash, P09 journal, actor, and posting time. `p10_allocations` links the invoice, its open item, treasury movement, direction, amount, and settlement journal. The approved local MVP fully allocates one movement to one invoice; unallocated advances and multi-invoice allocation are not implemented. See [ADR-008](../decisions/adr-008-p09-accounting-scope-and-posting-decisions.md) for the exact local account mapping and approval boundary.

## P11 as-of reporting contract

For a selected organization, book, direction, and Gregorian `as_of_date`, include posted invoices whose `effective_on <= as_of_date`. Subtract only allocations whose linked treasury movement has `effective_on <= as_of_date` and whose linked P09 journal is posted. Derive outstanding as the original amount less those dated allocations; use the stored `due_on` for aging. P10 currently rejects standalone reversal of linked journals and has no correction record, so P11 does not infer voids that are not represented in P10 data. See the implemented [P11 reporting contract](p11-reporting.md).

See [P10 architecture](../architecture/p10-settlement.md), [P10 security](../security/p10-settlement.md), [P05 sales documents](p05-sales-documents.md), [P07 fulfillment](p07-sales-fulfillment.md), [P08 purchase data](p08-purchasing.md), and [P09 accounting data](p09-accounting.md).
