---
type: Decision
title: ADR-008 P09 Accounting Scope and Posting Decisions
description: Records the P09 manual boundary, user-approved local P10 MVP paths and exact synthetic mapping, and decisions that continue to gate live source posting.
tags:
  - decision
  - accounting
  - journals
  - finance
status: active
---

# ADR-008: P09 Accounting Scope and Posting Decisions

## Status

Active. P09 is accepted for manual synthetic journals. P10 is accepted for the local ERP MVP only by user instruction dated 2026-11-24. No live/production posting is approved; the P10 profile remains `synthetic_test`.

## Worked journal fixtures

Each example is a manually created synthetic journal in the same `Synthetic IRR book`. The first four use accounting date `2026-11-22`, a Gregorian date in the open 2026 period. The sale reversal uses `2027-01-01`, the first date in a separate open period after the original 2026 period has been closed. No P05/P08 document or P06/P07 movement automatically creates these entries.

| Source event | Book | Accounting date | Debit | Credit | Expected result |
|---|---|---|---|---|---|
| Synthetic sale on account; no P05 source link | Synthetic IRR book | 2026-11-22 | Fixture Accounts Receivable 1,000,000 IRR | Fixture Sales Revenue 1,000,000 IRR | Balanced; 1,000,000 IRR each side |
| Synthetic purchase on account; no P08 source link | Synthetic IRR book | 2026-11-22 | Fixture Approved Purchase/Inventory 500,000 IRR | Fixture Accounts Payable 500,000 IRR | Balanced; debit-account selection remains unresolved for a real purchase |
| Synthetic customer collection; no P10 allocation | Synthetic IRR book | 2026-11-22 | Fixture Cash/Bank 400,000 IRR | Fixture Accounts Receivable 400,000 IRR | Balanced; no invoice allocation is recorded |
| Synthetic supplier payment; no P10 allocation | Synthetic IRR book | 2026-11-22 | Fixture Accounts Payable 200,000 IRR | Fixture Cash/Bank 200,000 IRR | Balanced; no payable allocation is recorded |
| Reversal of the synthetic sale | Synthetic IRR book | 2027-01-01 | Fixture Sales Revenue 1,000,000 IRR | Fixture Accounts Receivable 1,000,000 IRR | Original plus reversal nets to zero per account |

## Rules implemented for the local engine

1. P09 still supports explicit manual journals. P10 now calls the internal balanced-lines action for invoices and settlements after resolving the source inside the active organization. Only a dedicated synthetic profile can enable those P10 calls before live rules are approved; P05/P06/P07/P08 workflows do not call the action.
2. Book currency is whole Iranian rial (`IRR`, scale 0). P05's persisted whole-toman total converts by exact multiplication by 10 only when deliberately selected for a journal; 178831 toman is 1788310 rial. P08's whole-rial total remains unchanged; 500000 rial stays 500000 rial. Decimal or floating-point amounts are not accepted.
3. The supported fiscal calendar is explicit, inclusive Gregorian date ranges per book. The book stores an IANA timezone; the local default is `Asia/Tehran`. Periods cannot overlap. A journal date must match exactly one open period.
4. Period closure is one-way in P09. Posting and reversal require an open period and serialize against closure. Closing a period never edits or removes journals.
5. Reversal appends one new journal with every debit and credit swapped. The original remains immutable. A reversal date is chosen in an open period; the engine never reopens a closed period. This is a local conservative behavior and still requires domain-owner confirmation for production accounting.
6. The five fixtures contain no tax calculation or tax account, inventory-cost recognition, cost-of-goods entry, payment allocation, or receivable/payable settlement. Exact line sums and whole-rial totals reject overflow above the supported signed-integer range.

## P10 local ERP MVP approval (2026-11-24)

The user approved the following six P10 rules for the local ERP MVP only. Read-only inspection of the existing local database verified the exact target mapping:

- Organization: ID `1`, `سازمان پیش‌فرض`, slug `legacy-local`.
- Book: ID `2`, `P10-SYNTH-BROWSER` (`P10 synthetic settlement book`), whole-rial currency (`IRR`, scale 0).
- Profile: the existing `synthetic_test` profile. Its status and account links were not changed. These numeric IDs describe the current local database; after restoring or reseeding a database, verify organization/book/account codes before using the profile.

| Local event | Debit | Credit |
|---|---|---|
| Customer invoice | `1100` (ID 6, P10 fixture customer receivable) | `4100` (ID 7, P10 fixture customer revenue) |
| Supplier invoice | `5100` (ID 9, P10 fixture purchase expense) | `2100` (ID 8, P10 fixture supplier payable) |
| Customer receipt | `1010` (ID 10, P10 fixture customer treasury) | `1100` (ID 6, P10 fixture customer receivable) |
| Supplier payment | `2100` (ID 8, P10 fixture supplier payable) | `1020` (ID 11, P10 fixture supplier treasury) |

1. **Local scope:** Enable only the synthetic invoice and settlement workflow for organization 1 and book 2. The P10 profile remains `synthetic_test`; this approval does not create an `approved` profile or authorize production, staging, external services, or any other book/account mapping.
2. **Customer invoice:** Recognition occurs only when an editor explicitly submits an invoice for a confirmed P05 sales order. Invoiceable quantity is limited to delivered, not-yet-billed P07 delivery quantity. Partial billing is allowed, and cumulative billed quantity may not exceed delivered quantity. The editor supplies `effective_on` and `due_on`; the accounting date must fall in an open period.
3. **Supplier invoice:** Recognition occurs only when an editor explicitly submits an invoice for a P08 purchase order. Invoiceable quantity is limited to received, not-yet-billed warehouse receipt quantity. Partial billing is allowed, and cumulative billed quantity may not exceed received quantity. The editor supplies `effective_on` and `due_on`; the accounting date must fall in an open period.
4. **Amounts, tax, and costing:** Use whole IRR. Customer amounts use the persisted P05 whole-Toman line snapshots, cumulative half-up quantity rounding, and exact ×10 conversion. Supplier amounts use P08 whole-Rial unit-price snapshots with cumulative half-up rounding. P10 local invoices have zero tax. Supplier invoice debit uses the mapped purchase-expense fixture account; the local MVP does not capitalize inventory or post COGS.
5. **Settlement:** A customer receipt or supplier payment is explicitly entered, uses its mapped treasury account, and is fully allocated to one invoice. It cannot exceed that invoice's open balance. Unapplied advances and one movement split across multiple invoices are not supported.
6. **Closed periods and corrections:** New invoices and settlements must post into an open period. An exact same-key retry returns the original records even after closure and does not change balances. P10 invoices, allocations, and linked journals have no edit, delete, void, coordinated-correction, or standalone-reversal path. This local approval does not authorize corrections; a future correction workflow requires a separate decision.

The focused guarded P10 suite passed 7 tests / 136 assertions on 2026-11-24, including both invoice/settlement journeys, exact journal account codes and debit/credit amounts, replay after period closure, and rejection of standalone reversal for both P10 invoice and settlement journals. The existing Chrome acceptance evidence is linked at [P10 UI evidence](../../UI_DESIGN.md#p10-customer-and-supplier-settlement-evidence).

## Open domain decisions before live/source posting

The following decisions remain open for production. The local MVP approval above does not answer them.

| Open decision | Affected posting | Exact question to resolve |
|---|---|---|
| Customer invoice trigger, date, book, and accounts | Live customer invoice/receivable | For production, does invoice submission recognize the balance? Which live effective date/book and real accounts debit receivables and credit revenue? |
| Customer invoiceable quantity and partial billing | Live P05/P07 sales order lines and deliveries | Must production follow the local delivered-quantity/partial-billing rule? How should cancelled or unfulfilled remainder be handled? |
| Supplier invoice trigger, date, book, and payable account | Live P08 purchase order/receipt and P10 payable | For production, is supplier invoice submission the recognition event or must it follow receipt? Which live effective date/book and liability account apply? |
| Supplier invoiceable quantity and partial billing | Live P08 purchase order lines and warehouse receipts | Must production follow the local received-quantity/partial-billing rule? How should receipt/invoice quantity differences be handled? |
| Purchase debit and inventory costing | Live P08 purchase and P06/P07/P08 inventory | Should production capitalize inventory or use a purchases/expense account, at which source event, and which valuation method/cost source determines inventory and COGS? |
| Tax treatment | Live customer and supplier invoices | Are production source prices tax-exclusive or tax-inclusive? Which rates, tax accounts, rounding, and recognition dates apply? |
| Treasury accounts and allocation policy | Live P10 customer receipts and supplier payments | Which production cash/bank accounts apply? Can one movement settle multiple invoices or leave unapplied advances, and which open-item/account rules govern them? |
| Closed-period correction policy | Live P10 invoices and settlements | What coordinated correction workflow is required for production? The local MVP blocks standalone P10 reversal and has no correction route. |

Keep affected live source-driven posting disabled until these production decisions are explicitly approved and recorded. P09 manual synthetic journals do not settle production invoice issuance, payment allocation, taxes, or inventory valuation. The existing P10 synthetic profile is restricted to its local/test boundary and must not be used as a live mapping.

## Consequences

P05 remains whole Toman and P08 remains whole Rial. P09 stores integer whole-Rial debit/credit values and returns exact decimal strings. The internal `AccountingService::postBalancedLines` boundary requires an organization-scoped book/date, balanced lines, a source reference whose organization matches the active organization, and a UUID retry key. P10 resolves source records inside the organization before invoking it. P10 stores invoice effective/due dates, book, party, source links, treasury effective dates, allocation links, and posted journal IDs so P11 can derive dated balances. For an `as_of_date`, P11 includes invoices effective on/before the date and subtracts only linked allocations whose treasury effective date is on/before the date and whose journal is posted. The read-only P11 metric source, overdue-day boundary, selected-book timezone, and stock/approval cutoff contract are recorded in [P11 reporting data](../data/p11-reporting.md); P11 does not create or correct P10 postings.

See [P09 architecture](../architecture/p09-accounting.md), [P09 data](../data/p09-accounting.md), [P09 security](../security/p09-accounting.md), [P10 architecture](../architecture/p10-settlement.md), [P10 data](../data/p10-settlement.md), and [P10 security](../security/p10-settlement.md).
