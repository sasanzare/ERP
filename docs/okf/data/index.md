# Data Models

This section documents organization-owned records and their persisted relationships.

- [Shared master data](master-data.md) — parties, units, products, warehouses, locations, price lists, ownership constraints, and rial price representation.
- [P05 sales documents](p05-sales-documents.md) — leads, activities, quote/order snapshots, and exact Toman totals.
- [P06 stock ledger and balances](p06-stock-balances.md) — stock key, movement/reservation records, exact thousandths, availability, opening, and correction rules.
- [P07 fulfillment records](p07-sales-fulfillment.md) — reservation consumption/release counters, cancelled line quantity, and immutable delivery-to-movement links.

Read the [P04 architecture](../architecture/p04-master-data.md) for routes and request behavior, and the [P04 decision](../decisions/adr-003-p04-master-data-ownership-and-pricing.md) for the ownership and pricing rationale.
