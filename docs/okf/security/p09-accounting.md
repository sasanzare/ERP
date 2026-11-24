---
type: Security Model
title: P09 Accounting Organization Isolation and Authorization
description: Defines accounting reads and writes, active-organization scope, scoped line relationships, immutable posting, and period locking.
tags:
  - security
  - accounting
  - organization
  - authorization
status: active
---

# P09 Accounting Organization Isolation and Authorization

## Session and role boundary

The authenticated P03 session and active organization membership determine scope. Accounting routes do not accept an organization override and use the existing session `web` group plus explicit `X-CSRF-TOKEN` middleware for every mutation. Organization members can review books, accounts, periods, journals, lines, totals, and reversals. Editors can create setup records and drafts, edit draft lines, post, close periods, and reverse posted journals. The server enforces these rules with `viewAccounting` and `manageAccounting` policies.

## Relationship and immutable-record boundary

Routes resolve each requested book, period, account, or journal inside the active organization before validating dependent input. Every journal line's account must be active, postable, and in the journal's same book. A parent account cannot receive lines. Same-organization IDs from a different book fail relationship validation; foreign or unknown IDs are hidden as 404. Organization, book, journal status, date, lines, source reference, and idempotency payload are validated on the server.

Draft journals can be replaced only while draft. Direct update requests for posted journals return 409 before payload validation, and there is no delete route. Posting validates period boundaries and balances again under transaction locks; posted headers and lines are immutable through the API. Reversal creates a separate posted journal and preserves the original. Period closure is one-way in this phase and serializes on the book/period rows with posting and reversal.

## Transaction and retry behavior

The lock order begins with the organization-owned book, followed by journal, matching period, and sorted account rows. Period creation/closure also locks the book before periods. This prevents ambiguous overlapping-period creation races and ensures closure cannot race past a posting's open-period check. In MariaDB contention, a close-first request leaves a concurrent post in draft and returns 422 for the closed date. Unique request-key and original-to-reversal constraints backstop application retries and concurrent requests.

Same-key/same-payload replay returns the persisted journal. A key reused with a different payload returns 409. If an original already has a reversal, an exact same reversal request under another key returns that reversal and binds the new key; a different reversal date/reason conflicts. All failures roll back the journal status, lines, totals, and idempotency record together.

P10 callers must first resolve source records inside the active organization before invoking the internal balanced-lines action. P09 checks that the source reference declares the same organization, but that caller-owned source row is not exposed through a P09 HTTP endpoint.

See [organization access](organization-access.md), [P09 architecture](../architecture/p09-accounting.md), [P09 data](../data/p09-accounting.md), and [ADR-008](../decisions/adr-008-p09-accounting-scope-and-posting-decisions.md).
