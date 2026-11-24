---
type: Security Model
title: P10 Settlement Organization Isolation and Posting Gate
description: Defines active-organization access, editor-only settlement writes, retry safety, source scoping, and the synthetic posting gate.
tags:
  - security
  - settlements
  - organization
  - authorization
status: active
---

# P10 Settlement Organization Isolation and Posting Gate

## Session and role boundary

P10 routes use the existing authenticated `web` session and `ResolveActiveOrganization` middleware. Reads require the existing `viewAccounting` policy; invoice, receipt, and payment writes require `manageAccounting` plus the route group's explicit `X-CSRF-TOKEN` middleware. The organization ID is derived from the authenticated active membership and is never accepted from request input.

## Scoped relationships

The controller resolves the primary sales order, purchase order, or invoice inside the active organization before validating secondary body fields. The service re-resolves it inside the transaction, verifies the book and source order, locks source lines/events, and rejects foreign or mismatched delivery/receipt IDs. Composite foreign keys keep P10 invoices, invoice lines, open items, treasury movements, allocations, books, parties, accounts, and journals within the same organization/book.

## Posting gate, retries, and atomicity

The posting profile resolver checks that mapped accounts are active, postable, in the same IRR book, and have the required asset/liability/revenue categories. A `synthetic_test` profile is accepted only in `local`/`testing` on a `P10-SYNTH-` book; the approved local MVP uses the existing organization 1 / book 2 mapping recorded in ADR-008. An `approved` profile additionally requires an approval reference, actor, and timestamp. No HTTP route can create or activate a profile. This local approval does not make live/production profiles available.

Invoice keys bind organization, book, direction, source order, dates, source events, and quantities. Settlement keys bind direction, invoice, amount, effective date, and reference. Same-key payload changes conflict; exact retries resolve before checking the current remaining quantity/balance or current period status. Unique database keys backstop retry identity.

The transaction lock order starts with the accounting book. Invoice posting then locks source order → sorted source lines/events. Settlement locks invoice → open item before creating the treasury movement. `AccountingService::postBalancedLines` preserves P09's book → journal → period → sorted accounts order. An exception during posting rolls back P10 records and the P09 journal together.

Standalone P09 reversal rejects all `p10.*` journals. No edit/delete/void or coordinated P10 correction path exists. New postings in closed periods are rejected; exact-key retries remain idempotent after closure. See [ADR-008](../decisions/adr-008-p09-accounting-scope-and-posting-decisions.md) for the local approval and remaining live-posting decisions.
