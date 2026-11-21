# Architecture

This section tracks the implemented runtime architecture, the local database topology, and the current workspace and P03 access implementation.

- [Current architecture](current-architecture.md) — actual runtime and database topology.
- [P02 reusable product workspace](ui-workspace.md) — routes, React components, API reuse, and P03 shell integration.
- [Authentication and organization context](authentication-and-organization-access.md) — session routes, active organization resolution, and product write flow.
- [P04 master-data API and workspace](p04-master-data.md) — organization-scoped parties, products/units, locations, price lists, and Persian registers/forms.
- [P05 sales workflow](p05-sales-workflow.md) — scoped lead and activity routes, quote states, snapshots, conversion, and the P07 order-line contract.
- [P06 stock workflow](p06-stock-workflow.md) — standalone operations, location balances, reservations, locking, and the P07 link boundary.
- [P07 sales fulfillment](p07-sales-fulfillment.md) — confirmed order-line reservation, outbound issue, delivery history, and remainder cancellation.
