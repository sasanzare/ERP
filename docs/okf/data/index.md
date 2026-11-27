# Data Models

This section documents organization-owned records and their persisted relationships.

- [Shared master data](master-data.md) — parties, units, products, warehouses, locations, price lists, ownership constraints, and rial price representation.
- [P05 sales documents](p05-sales-documents.md) — leads, activities, quote/order snapshots, and exact Toman totals.
- [P06 stock ledger and balances](p06-stock-balances.md) — stock key, movement/reservation records, exact thousandths, availability, opening, and correction rules.
- [P07 fulfillment records](p07-sales-fulfillment.md) — reservation consumption/release counters, cancelled line quantity, and immutable delivery-to-movement links.
- [P08 purchasing records](p08-purchasing.md) — request/order snapshots, whole-rial purchase prices, receipt quantities, and P06 operation/movement links.
- [P09 accounting records](p09-accounting.md) — book, account, period, journal, line, and request-key records.
- [P10 settlement records](p10-settlement.md) — invoices, open items, treasury movements, allocations, whole-Rial amounts, and P11 as-of reporting.
- [P11 reporting contract](p11-reporting.md) — metric source rows, date/unit boundaries, organization/book scope, exact currency display, and all-page reconciliation.
- [P12 project work](p12-project-work.md) — project/task/comment/reminder persistence and exact whole-rial project purchase costs.
- [P13 role administration and party imports](p13-administration-and-data-exchange.md) — explicit organization role-manager grants and durable import-request/row outcomes.

Read the [P04 architecture](../architecture/p04-master-data.md) for routes and request behavior, and the [P04 decision](../decisions/adr-003-p04-master-data-ownership-and-pricing.md) for the ownership and pricing rationale.
