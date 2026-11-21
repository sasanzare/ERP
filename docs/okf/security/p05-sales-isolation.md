---
type: Security Model
title: P05 Sales Document Isolation
description: Documents organization scope, reader/editor permissions, transitions, and idempotent order conversion.
tags:
  - security
  - sales
  - authorization
status: active
---

# P05 Sales Document Isolation

## Session and organization boundary

P05 uses the P03 authenticated Laravel session, server-resolved active organization, membership policy, and explicit CSRF-token middleware. The request never supplies organization ownership. Lead, activity, quote, order, product, party, unit, price-list, and source-line lookups are scoped before data is serialized or changed. Foreign IDs are hidden as not found for document reads and produce generic validation errors in selectors/writes.

The `reader` membership can list and open organization sales documents. The `editor` membership can create leads and activities, complete follow-ups, edit draft quote lines, confirm quotes, and convert them to orders. UI capability flags only control presentation; the organization policy enforces every server write.

## State and concurrency boundary

Allowed quote changes are enforced server-side: `draft → confirmed → one sales order`. Stale edits and invalid transitions fail without updating the quote. Completing an activity is idempotent and preserves its first completion timestamp.

Order conversion locks the confirmed quote, verifies its stored calculations, and copies the order and every source line in one transaction. `sales_orders.source_quote_id` is unique at the database level; each `sales_order_lines.source_quote_line_id` is unique and links back to one quote line. A failed line insert rolls back the order header and all lines. Retrying a successful conversion returns the existing order.

## Boundary

P05 does not read or reserve stock, issue fulfillment, invoice, post accounting, or contact external services. P06 owns stock balances/reservations; P07 consumes the stable order-line source interface under the same active-organization boundary.

## Verification

Feature coverage verifies reader writes are denied, foreign document/master-data IDs remain scoped, non-customer parties cannot enter the sales path, stale transitions do not change state, conversion failures roll back the order header, and retries return one order. The full guarded suite passed 45 tests / 363 assertions. Chrome confirmed the editor journey, reader write responses 403, one order for the source quote, and no browser runtime errors. MariaDB row-lock contention was exercised through two local PHP workers.

See [P03 access security](organization-access.md), [P05 data model](../data/p05-sales-documents.md), and [P05 workflow](../architecture/p05-sales-workflow.md).
