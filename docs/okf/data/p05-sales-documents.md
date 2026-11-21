---
type: Data Model
title: P05 Sales Documents and Exact Toman Pricing
description: Defines P05 lead, activity, quote, order, snapshot, and Rial-to-Toman data contracts.
tags:
  - data
  - sales
  - pricing
status: active
---

# P05 Sales Documents and Exact Toman Pricing

## Organization-owned records

| Table | Main relationships and values |
|---|---|
| `leads` | Active-organization customer party, generated code, and title. |
| `lead_activities` | Organization-scoped lead, title, due time, and nullable completion time. |
| `sales_quotes` | Lead, customer party, selected P04 price list, status, display snapshots, and integer `total_toman`. |
| `sales_quote_lines` | Product/unit IDs and label snapshots, quantity, unit-price snapshot, discount basis points, and integer `line_net_toman`. |
| `sales_orders` | Unique source quote, lead/customer links and snapshots, confirmed status, and integer `total_toman`. |
| `sales_order_lines` | Copied quote-line snapshot and unique `source_quote_line_id` for P07 traceability. |

Composite organization foreign keys and scoped API lookups keep every reference within the active organization. Product and unit IDs remain as traceable references; display fields preserve the historical document if master-data labels later change.

## Currency boundary

P04 remains the owner of price-list amounts and stores whole integer rials in `price_list_entries.amount_rial`. P05 quotes and orders use toman. At quote-line entry or explicit repricing, P05 copies the P04 integer rial amount as `unit_price_toman_tenths`: one stored rial is exactly one tenth of a toman. The API serializes that value as a decimal string such as `120000.0`; it never passes through floating-point arithmetic. A missing price entry is invalid; an existing entry with amount `0` is a valid zero price.

The repeatable P05 demo list uses P04 entries of 1,200,000 and 1,350,000 rials, displayed in P05 as 120,000.0 and 135,000.0 toman. Existing product IDs, ownership, and P04 prices are left intact.

## Precision and calculation

- Quantity is a positive decimal string with at most three fractional digits, bounded at `999999999.999` in the product base unit.
- Discount is a decimal percentage from `0.00` through `100.00`, at most two fractional digits, stored as basis points.
- The exact line amount in toman is `quantity × (P04 rial amount / 10) × (1 − discount)`. The implementation uses scaled integers: quantity in thousandths and unit price in tenths of a toman. It rounds once per line to a whole toman using half-up rounding; document totals sum the rounded lines.
- Inputs, line intermediates, and document totals are bounded by the supported signed PHP integer range. Unsupported decimal precision, quantity range, and overflow are rejected before persistence.
- A half-toman case such as `0.001 × 500.0 toman` rounds to 1 toman. A line below one half rounds to 0.

The quote and conversion paths call the same server-side calculator. Confirmation and conversion use persisted snapshots. Editing quantity/discount preserves a line's price; adding a line or explicit repricing refreshes the P04 selected-list price snapshot. Repricing also refreshes the product and unit label snapshots for that draft line.

See [P05 workflow routes](../architecture/p05-sales-workflow.md), [ADR-004](../decisions/adr-004-p05-sales-currency-and-snapshots.md), and the [P04 master-data price representation](master-data.md).

## Migration and verification

Forward migration `2026_11_21_000006_create_p05_sales_tables` adds the six P05 tables without altering P04 structures. It was applied to the existing `erp_dev` database without resetting its volume. Readback kept legacy product IDs 1 and 2, P04 `DEMO-002` ID 3, and added P05 products IDs 4 and 5 with base unit EA. The P05 list contains 1,200,000 and 1,350,000 rial entries. Running `p03:provision-demo` twice retained these IDs and prices.

P05 rollback/reapply was rehearsed on guarded `erp_test`; readback showed P03/P04 still applied while only P05 was pending, then reapplication succeeded. The final guarded suite passed 45 tests / 363 assertions. The browser and exact calculation evidence is in the [P05 workflow](../architecture/p05-sales-workflow.md) and [UI reference](../../UI_DESIGN.md#p05-sales-workflow-evidence).
