# Architecture

This section tracks the implemented runtime architecture, the local database topology, and the current P03–P13 workspace and access boundaries.

- [Current architecture](current-architecture.md) — actual runtime and database topology.
- [P02 reusable product workspace](ui-workspace.md) — routes, React components, API reuse, and P03 shell integration.
- [Authentication and organization context](authentication-and-organization-access.md) — session routes, active organization resolution, and product write flow.
- [P04 master-data API and workspace](p04-master-data.md) — organization-scoped parties, products/units, locations, price lists, and Persian registers/forms.
- [P05 sales workflow](p05-sales-workflow.md) — scoped lead and activity routes, quote states, snapshots, conversion, and the P07 order-line contract.
- [P06 stock workflow](p06-stock-workflow.md) — standalone operations, location balances, reservations, locking, and the P07 link boundary.
- [P07 sales fulfillment](p07-sales-fulfillment.md) — confirmed order-line reservation, outbound issue, delivery history, and remainder cancellation.
- [P08 purchasing](p08-purchasing.md) — independent approval, one supplier order per request, exact Rial snapshots, and partial inbound receipts through P06.
- [P09 accounting](p09-accounting.md) — manual balanced journals, period controls, retries, and reversals.
- [P10 settlement](p10-settlement.md) — customer/supplier invoices, open items, treasury allocations, linked P09 journals, and the current synthetic-only gate.
- [P11 dashboard](p11-dashboard.md) — read-only reconciled metrics, active-book date/timezone handling, filtered source rows, and the repeatable local walkthrough.
- [P12 projects and assigned work](p12-project-work.md) — projects, task transitions/counts, local assigned inbox, due-reminder lifecycle, and P08 cost links.
- [P13 administration and party exchange](p13-administration-and-data-exchange.md) — explicit role-manager grants, scoped membership history, retry-safe CSV/XLSX import, and filtered CSV export.
