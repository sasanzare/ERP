---
okf_version: "0.2"
---

# ERP Project Knowledge

This bundle records the scope, architecture, and decisions for the local-development ERP project. P01–P06 are accepted; P07 remains planned. See the handoff for current runtime and acceptance evidence.

## Start here

- [Project overview](project-overview.md) — scope and phase boundaries.
- [Architecture](architecture/index.md) — current and planned runtime shape.
- [P04 master-data architecture](architecture/p04-master-data.md) — scoped APIs, shared registers/forms, and selected-list pricing.
- [P05 sales workflow](architecture/p05-sales-workflow.md) — leads, follow-ups, quote snapshots, and confirmed order conversion.
- [P06 stock workflow](architecture/p06-stock-workflow.md) — standalone stock operations, balance views, and reservations.
- [Data models](data/index.md) — organization-owned master data and exact rial amount storage.
- [P05 sales documents](data/p05-sales-documents.md) — organization-scoped sales records and exact Rial-to-Toman calculations.
- [P06 stock data](data/p06-stock-balances.md) — stock keys, exact quantities, balance equations, opening rule, and correction strategy.
- [Organization access security](security/organization-access.md) — session, membership, product isolation, and role boundary.
- [P04 master-data isolation](security/p04-master-data-isolation.md) — reader/editor, selectors, foreign IDs, and relationship checks.
- [P05 sales isolation](security/p05-sales-isolation.md) — document scoping, editor writes, transitions, and conversion safeguards.
- [P06 stock isolation](security/p06-stock-isolation.md) — organization-scoped stock reads/writes, location pairing, and concurrency locks.
- [UI design reference](../UI_DESIGN.md) — P02 workspace and P03 organization/session visuals and browser evidence.
- [Decisions](decisions/index.md) — accepted project decisions.
- [Maintenance log](log.md) — significant knowledge updates.

Read [HANDOFF.md](../../HANDOFF.md) for current repository state, validation evidence, and exact next steps.
