---
type: Data Model
title: P09 Accounting Records
description: Defines exact Rial journals, organization-owned books and accounts, fiscal periods, immutable posting metadata, and idempotency references.
tags:
  - data
  - accounting
  - journals
status: active
---

# P09 Accounting Records

## Books, accounts, and periods

An `accounting_books` row belongs to one organization and records its unique code, name, base currency (`IRR`, scale 0), and IANA timezone. An `accounting_accounts` row belongs to the same organization and book, has a scoped code, category (`asset`, `liability`, `equity`, `revenue`, or `expense`), optional non-postable parent, and postable/active flags. A postable account cannot have children; a parent cannot accept journal lines.

An `accounting_periods` row belongs to one book and has a unique code, inclusive Gregorian start/end dates, `open` or `closed` status, and closure actor/time. Periods in one book may not overlap. A posting date must resolve to exactly one period; a missing match is rejected and multiple matches are treated as a data conflict.

## Journals and lines

`accounting_journals` stores book and organization scope, date, code, description, draft/posted status, optional source fields (`source_type`, `source_record_id`, `source_event_key`), creator, posting actor/time, posting identity, exact debit/credit total snapshots, optional `reversal_of_journal_id`, and the normalized `reversal_request_hash`. The reversal hash binds a repeated source reversal to its date/reason and original content. Source fields have no foreign key because P10 source domains do not exist yet; a future caller must first resolve the source inside the active organization. Posted journal and line rows have no edit or delete API. A unique organization/book/original relation permits one reversal.

`accounting_journal_lines` stores the line number, same-book account, memo, and exact whole-rial debit and credit. Each line has one positive side and a zero opposite side; migration 000011 adds a MariaDB CHECK constraint for this shape. Posted journal totals are exact sums bounded by the PHP signed-integer and MariaDB supported range; values serialize as decimal strings. Application arithmetic uses integers only.

`accounting_request_keys` stores operation (`post` or `reverse`), UUID key, request hash, resulting journal, and actor. The key is unique per organization, book, and operation. The record binds retries to one normalized payload and resolves successful retries even when the period later closes.

## Migration and rollback

Migration `2026_11_22_000010_create_p09_accounting_tables` creates these six tables additively. Migration `2026_11_22_000011_add_p09_one_sided_line_amount_check` adds the one-sided amount constraint. Rolling back both migrations removes P09 books, accounts, periods, journals, lines, and request identities; it does not alter P01–P08 tables. Do not roll back P09 in the populated development database.

## Currency boundary

The P09 ledger uses whole Iranian rials. P05 snapshots remain whole toman; converting a selected persisted P05 total uses exact string/integer multiplication by 10 with range validation (178831 toman becomes 1788310 rial). P08 `total_rial` is already an exact whole-rial snapshot and is not converted (500000 remains 500000 rial). Large amounts are returned to React as decimal strings and formatted with `BigInt`; no IEEE-754 arithmetic is used.

See [P05 sales data](p05-sales-documents.md), [P08 purchasing data](p08-purchasing.md), [P09 architecture](../architecture/p09-accounting.md), and [ADR-008](../decisions/adr-008-p09-accounting-scope-and-posting-decisions.md).
