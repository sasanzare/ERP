---
type: Architecture
title: P11 Reconciled Local Dashboard
description: Describes the read-only P11 dashboard, its scoped reporting endpoints, source drill-downs, and repeatable synthetic walkthrough.
tags:
  - architecture
  - dashboard
  - reporting
status: active
---

# P11 Reconciled Local Dashboard

## Scope

P11 adds a read-only Persian RTL `/dashboard` workspace. It reports net sales, overdue receivables, available stock, and purchase requests awaiting approval. It does not create journals, settlements, stock movements, or approvals from the dashboard. P10 continues to own the approved local synthetic invoice and settlement paths; live posting remains disabled.

## HTTP surface

| Method and path | Purpose |
|---|---|
| `GET /api/v1/dashboard/options` | Return books belonging to the active organization and the default report date in the selected default book's IANA timezone. |
| `GET /api/v1/dashboard?book_id=&as_of_date=&currency=` | Return all four server-calculated metric totals and their reconciliation counts. |
| `GET /api/v1/dashboard/metrics/{metric}?book_id=&as_of_date=&currency=&page=` | Return one filtered source population in pages of 25, with an all-pages reconciliation total. |

Supported metric names are `net-sales`, `overdue-receivables`, `available-stock`, and `pending-purchase-approvals`. Dashboard report routes share the authenticated session and active-organization middleware. The book selector scopes the financial metrics; stock and approvals remain organization-wide.

## Query and display boundaries

The selected accounting book supplies the IANA timezone used to interpret an `as_of_date`. Dated operational events use an inclusive `23:59:59` end-of-day cutoff in that timezone, converted to UTC for timestamp queries. Financial documents use their persisted date-only fields directly.

Financial aggregates stay as whole-Rial decimal strings through JSON. Toman display divides Rial by ten exactly and retains one fractional digit when needed. Stock values remain exact three-decimal quantity strings; totals are grouped by base unit.

The dashboard detail endpoint reuses the same eligibility predicates as its tile and computes reconciliation across the full source population, independent of page size. It does not rely on the existing P10 or P08 list endpoint limits.

## Repeatable synthetic walkthrough

`p11:provision-walkthrough` uses the existing `legacy-local` organization, existing `P10-SYNTH-BROWSER` / `synthetic_test` mapping in local `erp_dev`, and stable business identities plus the accepted P05, P06, P07, P08, and P10 services/controllers. It seeds a 10.000 EA stock baseline, sale/issue/customer invoice/400,000-IRR collection, purchase request/independent approval/order/receipt/supplier invoice/200,000-IRR payment, and one request left pending. Same-key replays return the existing source records; no profile, period, or manual journal is replaced.

The command is restricted to local `erp_dev` or guarded `erp_test`. In tests, `RefreshDatabase` creates a separate synthetic organization/book/profile fixture and invokes the command twice to verify stable rows and balances. See the [P11 reporting data contract](../data/p11-reporting.md), [P11 access boundary](../security/p11-reporting.md), [README walkthrough](../../../README.md#p11-reconciled-local-dashboard), and [P11 browser evidence](../../UI_DESIGN.md#p11-reconciled-dashboard-evidence).
