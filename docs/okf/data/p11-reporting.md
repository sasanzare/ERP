---
type: Data Model
title: P11 As-of Dashboard Reporting
description: Defines P11 source-row eligibility, end-of-day boundaries, units, exclusions, and reconciliation for all four dashboard metrics.
tags:
  - data
  - reporting
  - dashboard
status: active
---

# P11 As-of Dashboard Reporting

## Report parameters

Every report uses the authenticated active organization, an organization-owned accounting book, a Gregorian `as_of_date`, and a display currency (`IRR` or `TOMAN`). The book ID is required to validate financial scope and supplies the IANA timezone for timestamped operational cutoffs. The report date is inclusive through `23:59:59` in that timezone; timestamp bounds are converted to UTC before comparing stored timestamps. Date-only accounting events compare directly to `as_of_date`.

The default display is whole Rial. The API keeps Rial totals as exact strings. Toman conversion is exact division by ten; if the last Rial digit is nonzero, the displayed Toman string retains that one fractional digit. Quantity strings retain exactly three decimal places.

## Metric contract

| Tile | Source and eligibility | Cutoff and unit | Exclusions and drill-down population |
|---|---|---|---|
| Net sales | `p10_invoices` joined to its `accounting_journals` row; include only `direction = customer`, invoice status `posted`, posted journal, selected organization/book, and `effective_on <= as_of_date`. Sum invoice `amount_rial`. | Date-only effective date; whole IRR, optionally shown as exact Toman. | Excludes supplier invoices, drafts, quotes, sales-order totals, receipts, standalone P09 manual journals, and any correction/void not represented by P10. Detail rows are exactly the eligible customer invoices. Receipts do not reduce sales. |
| Overdue receivables | The same eligible customer invoice set, additionally `due_on < as_of_date`. Subtract `p10_allocations.amount_rial` only when its linked customer receipt has `effective_on <= as_of_date` and the allocation's linked settlement journal is posted. Keep only positive residuals. | Date-only effective/due dates; whole IRR, optionally shown as exact Toman. | An invoice due on the cutoff date is not overdue. Future-dated receipts and allocations with an unposted journal do not reduce the as-of balance. Detail rows are exactly the positive residual invoices. |
| Available stock | `inventory_movements` for the organization, grouped by product, saved base unit, and location; physical stock is inbound minus outbound. Include movements with `created_at <= cutoff`. Reservations created by cutoff reduce availability; subtract P07 deliveries whose persisted event `created_at` is by cutoff and subtract the reservation's released quantity only when `released_at <= cutoff`. Availability is physical minus outstanding reserved quantity. | Timestamped operational events use the selected book's end-of-day timezone. Quantities use three decimal places. Summary totals are grouped by base unit; drill-down rows are product/location pairs with positive availability. | Organization-wide; selected book does not filter inventory. Uses persisted P06 movements, P06 reservation creation/release timestamps, and P07 delivery event timestamps. P08 receipts contribute through their linked P06 inbound movements. The accepted P06 release operation and P07 remainder cancellation release one full remaining amount at one persisted timestamp, so the existing history supports this reconstruction. Inconsistent negative physical or available balances fail instead of being clamped. |
| Pending purchase approvals | Organization-owned `purchase_requests` with `submitted_at <= cutoff` and status `submitted`, `approved`, or `converted`; include requests with no `approved_at` or `approved_at > cutoff`. | Timestamped submission/approval events use the selected book's end-of-day timezone. Unit is request count. | Organization-wide; selected book does not filter approvals. Drafts, submissions after cutoff, and approvals completed by the cutoff are excluded. Detail rows are exactly the matching requests, including a request approved after the report cutoff. |

## Reconciliation and access

Financial detail queries use the same predicates and residual calculation as their tiles. Stock detail rows retain product/location, physical, reserved, available, and unit values. Approval details retain request identity and submission time. Detail results use a server-side page size of 25; each response reports the total record count and a full-population reconciliation value, so a page limit cannot change a tile.

The organization ID is never accepted from query input. The controller resolves the authenticated active organization and looks up `book_id` inside it. A foreign or unknown book returns 404. See [P11 architecture](../architecture/p11-dashboard.md), [P11 security](../security/p11-reporting.md), [P06 stock history](p06-stock-balances.md), [P08 purchase lifecycle](p08-purchasing.md), [P10 settlement records](p10-settlement.md), and [ADR-008](../decisions/adr-008-p09-accounting-scope-and-posting-decisions.md).
