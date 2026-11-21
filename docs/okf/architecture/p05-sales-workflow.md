---
type: Architecture
title: P05 Lead to Confirmed Sales Order
description: Describes the scoped lead, follow-up, quote, and confirmed sales-order workflow.
tags:
  - architecture
  - sales
  - workflow
status: active
---

# P05 Lead to Confirmed Sales Order

## Scope

P05 connects an organization-owned customer lead to dated activities, a price-list-backed quote, and one confirmed sales order. Stock, reservation, and fulfillment are handled by P06/P07; invoicing, finance, and external services remain outside these phases.

## API and workspace routes

| Workspace | API | Purpose |
|---|---|---|
| `/leads`, `/leads/new`, `/leads/{id}` | `/api/v1/leads` | Search, create, and read leads linked to active-organization parties with the customer role. |
| `/follow-ups`, `/follow-ups/{id}` | `/api/v1/lead-activities/overdue`, `/api/v1/lead-activities/{id}` | View overdue activities and complete them idempotently. |
| `/quotes`, `/quotes/{id}` | `/api/v1/quotes` | Create draft quotes from leads, add/edit/remove/reprice draft lines, and confirm. |
| `/orders`, `/orders/{id}` | `/api/v1/sales-orders` | Read confirmed orders with source quote, lead, customer, and copied line snapshots. |
| — | `/api/v1/quotes/{id}/convert` | Convert one confirmed quote atomically; retries return its existing order. |

Every API route uses the P03 session, active-organization middleware, and explicit CSRF token on writes. Readers may view their organization's sales documents; editors may write.

## Activity cutoff and completion

An open activity is overdue only when `due_at < now()` using the Laravel application clock. Equality with the cutoff is not overdue. Completion sets `completed_at` once under a row lock; a retry returns the original timestamp. The overdue queue filters for both a null completion timestamp and a due time strictly before the current application time.

## Quote lifecycle

The only quote states are `draft` and `confirmed`. A draft can have lines added, quantities and discounts edited, lines removed, or an individual line repriced. Adding a line and explicitly repricing it refresh the selected-list price and product/unit display snapshots. Quantity or discount edits preserve the saved unit price. Confirmation recalculates from persisted snapshots and freezes the quote; it does not query the current price list.

Confirmation requires at least one line. Editing or confirming a non-draft quote is rejected. Conversion requires a confirmed quote, verifies persisted line amounts and total with the shared calculator, and creates the order and copied lines in one MariaDB transaction. A row lock plus unique `sales_orders.source_quote_id` makes conversion retries return the one order. `sales_order_lines.source_quote_line_id` is the stable P07 link to each source line. P07 consumes confirmed order-line product/unit/quantity snapshots without changing the Toman price, discount, source quote, or total; see [P07 sales fulfillment](p07-sales-fulfillment.md).

## UI composition

The desktop sales workspace reuses the P02 Lens Inspector shell, with the register/detail surface as the focal content and the shared toolbar/navigation as command surfaces. Mobile retains the P02 Mobile Focus Sheet and existing bottom dock. Glass controls reuse shared components; forms, tables, and money remain sharp content surfaces with reduced-transparency and forced-fallback support.

## Verification

The guarded Laravel suite passed 45 tests / 363 assertions after P05 migration rollback/reapply on `erp_test`. TypeScript, production build, changed-file Pint, PHP syntax, and route registration passed. Chrome verified the lead/follow-up/quote/order journey at 1280×900 and 390×844, visible keyboard focus and Enter submission, and forced bright fallback with zero runtime errors. The browser harness held the quote row lock while conversion requests reached two local PHP workers; responses were 201/200 with the same order. The final order had two copied lines and the P05 fixture price was restored after snapshot checks. See [saved UI evidence](../../UI_DESIGN.md#p05-sales-workflow-evidence) and [HANDOFF.md](../../../HANDOFF.md).

See [P05 documents and pricing](../data/p05-sales-documents.md), [P05 sales isolation](../security/p05-sales-isolation.md), [P07 sales fulfillment](p07-sales-fulfillment.md), and [ADR-004](../decisions/adr-004-p05-sales-currency-and-snapshots.md).
