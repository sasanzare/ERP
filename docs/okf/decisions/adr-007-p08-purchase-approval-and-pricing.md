---
type: Decision
title: ADR-007 P08 Approval, Currency, and Receipt Locking
description: Records P08's independent approval rule, exact purchase currency and rounding, conversion retry identity, and receipt lock order.
tags:
  - decision
  - purchasing
  - approval
  - currency
status: accepted
---

# ADR-007: P08 Approval, Currency, and Receipt Locking

## Status

Accepted for the local-development P08 boundary.

## Context

Purchase requests need an independent approval event, supplier-order prices that survive master-data changes, and partial inbound inventory receipts that cannot over-receive or diverge from the P06 stock ledger. The existing P04 price lists store rials while P05 sales documents store Toman.

## Decisions

1. The authenticated requester cannot approve their own request. A different organization editor is the minimum authorized approver; the API enforces the same rule as the UI.
2. P08 supplier orders use whole Iranian rials (`IRR`, scale 0) per saved product base unit. For quantity thousandths, each line total rounds half-up once to a whole rial. The order total is the sum of those rounded line totals. P08 does not convert to Toman, rewrite P04 price lists, or alter P05 sales snapshots. Integer overflow is rejected rather than approximated with floating point.
3. One source request has at most one purchase order. Conversion records a payload hash over source lines, supplier, and agreed prices; exact retries return the original order, and changed input conflicts.
4. Receipt locking follows purchase order → order line → product → warehouse/location → stable P06 stock key. The service rechecks remaining quantity, current base unit, and order state under those locks. Receipt trace, inbound operation/movement, received counters, and closeout are one transaction.
5. A receipt UUID binds organization, order line, warehouse, location, and quantity. Exact replay returns the same receipt/operation/movement IDs, including after closeout. P06 standalone receipt remains available.

## Consequences

The order records unit prices/totals and supplier/product/unit labels as historical snapshots. Quantity receipt uses the existing P06 ledger and stable stock lock; it does not alter reservations. P09 accounting decisions and P10 supplier invoicing/payables remain separate phases.

## Related knowledge

- [P08 workflow](../architecture/p08-purchasing.md)
- [P08 data model](../data/p08-purchasing.md)
- [P08 security](../security/p08-purchasing.md)
- [P06 stock ledger decision](adr-005-p06-stock-ledger-and-locks.md)
