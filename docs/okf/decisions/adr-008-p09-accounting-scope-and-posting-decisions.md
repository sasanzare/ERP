---
type: Decision
title: ADR-008 P09 Accounting Scope and Posting Decisions
description: Records the synthetic journal rules, exact currency boundary, period and reversal mechanics, and open business decisions that gate source-driven posting.
tags:
  - decision
  - accounting
  - journals
  - finance
status: active
---

# ADR-008: P09 Accounting Scope and Posting Decisions

## Status

Active for the local synthetic P09 journal-engine boundary. The account labels and example entries below are fixtures; they are not approved automatic business mappings.

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

1. P09 posts only explicit manual journals and provides an internal balanced-lines action for future P10 use. No current sales, purchase, stock, receipt, or fulfillment workflow calls that action.
2. Book currency is whole Iranian rial (`IRR`, scale 0). P05's persisted whole-toman total converts by exact multiplication by 10 only when deliberately selected for a journal; 178831 toman is 1788310 rial. P08's whole-rial total remains unchanged; 500000 rial stays 500000 rial. Decimal or floating-point amounts are not accepted.
3. The supported fiscal calendar is explicit, inclusive Gregorian date ranges per book. The book stores an IANA timezone; the local default is `Asia/Tehran`. Periods cannot overlap. A journal date must match exactly one open period.
4. Period closure is one-way in P09. Posting and reversal require an open period and serialize against closure. Closing a period never edits or removes journals.
5. Reversal appends one new journal with every debit and credit swapped. The original remains immutable. A reversal date is chosen in an open period; the engine never reopens a closed period. This is a local conservative behavior and still requires domain-owner confirmation for production accounting.
6. The five fixtures contain no tax calculation or tax account, inventory-cost recognition, cost-of-goods entry, payment allocation, or receivable/payable settlement. Exact line sums and whole-rial totals reject overflow above the supported signed-integer range.

## Open domain decisions before automatic source posting

| Open decision | Affected posting | Exact question to resolve |
|---|---|---|
| Sale recognition trigger and account mapping | P05 sale on account and its reversal | Which approved event creates the receivable/revenue journal (invoice, order confirmation, or another event), and which real accounts map to receivable and revenue? |
| Purchase debit account | P08 purchase on account | Should the 500000-rial debit represent inventory capitalization or an approved purchases/expense account, and at which source event? |
| Tax treatment | Sales and purchases | Are example/source amounts tax-exclusive or tax-inclusive; which rates, tax accounts, and recognition dates apply? |
| Inventory costing | P06/P07/P08 stock events and cost of goods | Which valuation method and approved cost source determine inventory value and COGS at receipt/issue/fulfillment? |
| Cash/bank and settlement mapping | P10 collection and supplier-payment examples | Which treasury event, bank/cash accounts, allocation rules, and payable/receivable source records create settlement journals? |
| Closed-period reversal policy | Reversal of any source-driven journal | For a real closed-period correction, is a current open-period reversal allowed, or is another reviewed adjustment workflow required? |

Keep affected source-driven posting disabled until these decisions are explicitly approved and recorded. P09 manual synthetic journals do not settle invoice issuance, payment allocation, taxes, or inventory valuation.

## Consequences

P05 remains whole Toman and P08 remains whole Rial. P09 stores integer whole-Rial debit/credit values and returns exact decimal strings. The internal P10 interface accepts an organization-scoped book, date, balanced lines, a source reference whose organization ID matches the active organization, and a UUID retry key. The P10 caller must resolve its source record within that organization before invoking the service, and no current workflow calls the service.

See [P09 architecture](../architecture/p09-accounting.md), [P09 data](../data/p09-accounting.md), and [P09 security](../security/p09-accounting.md).
