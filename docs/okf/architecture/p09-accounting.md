---
type: Architecture
title: P09 Balanced Accounting Engine
description: Describes the local manual journal workflow, balanced posting boundary, period serialization, retry identity, and reversal behavior.
tags:
  - accounting
  - journals
  - finance
status: active
---

# P09 Balanced Accounting Engine

## Scope

P09 is accepted at the local manual/synthetic engine boundary. It adds organization-owned accounting books, a small chart of accounts, date-bounded fiscal periods, journal drafts, atomic posting, and immutable reversals. Existing P05 sales, P06/P07 stock, and P08 purchasing workflows do not post accounting entries automatically. Source-driven recognition waits for the open decisions in [ADR-008](../decisions/adr-008-p09-accounting-scope-and-posting-decisions.md).

An editor creates a book, postable or heading accounts, and non-overlapping periods. Editors can create or replace lines on draft journals, post them, close a period, and reverse a posted journal. Members with the reader role can review books, accounts, periods, journals, lines, totals, and reversal relationships.

## Posting boundary

A journal has a date-only accounting date in the book's configured timezone and must match exactly one open period. A line has one positive whole-rial debit or credit and zero on the other side. Posting requires at least one debit and credit, a nonzero balanced total, active postable accounts from the same organization and book, and a unique request identity. Journal state, posting actor/date, posting time, posting identity, and total snapshots are saved in the same transaction.

Posting, period closure, and period creation lock the book row first. Posting and reversal then lock their journal and period rows in a stable order, followed by account rows in ascending ID order. This also serializes period closure with a concurrent journal write. The conservative per-book lock is appropriate for the local prototype; throughput is not qualified.

Exact retries resolve from the persisted organization/book/operation/key record before checking current period state, so a period closed after success does not invalidate a replay. A changed payload under the same key conflicts. One unique original-to-reversal relation prevents a second reversal, including under a different key. Reversals append a new journal with debit and credit sides swapped; they never reopen or modify the original period or journal.

## HTTP surface

All routes are under authenticated `/api/v1/accounting` with the active-organization middleware. Reads are available to organization members; every write also requires the editor policy and explicit CSRF token.

| Method and path | Purpose |
|---|---|
| `GET /options?book_id={id}` | List scoped books and the selected book's accounts/periods. |
| `GET /journals?book_id={id}` | List up to 100 journals for the scoped book. |
| `GET /journals/{journalId}` | Read one organization-scoped journal and reversal links. |
| `POST /books` | Create an IRR book and timezone. |
| `POST /books/{bookId}/accounts` | Create a heading or postable account. |
| `POST /books/{bookId}/periods` | Create a non-overlapping inclusive period. |
| `POST /periods/{periodId}/close` | Close a period one way. |
| `POST /journals` | Create a draft with structurally valid one-sided lines. |
| `PUT /journals/{journalId}` | Replace a draft; posted journals return 409. |
| `POST /journals/{journalId}/post` | Atomically validate and post with `Idempotency-Key`. |
| `POST /journals/{journalId}/reverse` | Append a balanced reversal in an open period with `Idempotency-Key`. |

## P10 interface

P10 can call the internal `AccountingService::postBalancedLines` application action with an active organization, actor, book, accounting date, description, positive/zero Rial lines, a source reference carrying the same organization ID, and a stable UUID idempotency key. P10 must first resolve the source record inside that organization; this future caller boundary is not exposed as an HTTP route. The action checks the source organization ID, book/account scope, and balances, then creates and posts in one transaction. Do not call it from current P05/P06/P07/P08 flows until the corresponding business rules are approved.

See [P09 data](../data/p09-accounting.md), [P09 security](../security/p09-accounting.md), and [ADR-008](../decisions/adr-008-p09-accounting-scope-and-posting-decisions.md).
