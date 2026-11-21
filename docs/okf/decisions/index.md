# Decisions

This directory records accepted architecture and scope decisions.

- [P01 stack and isolation](adr-001-p01-stack-and-isolation.md) — Laravel 13, local PHP, MariaDB, and the database-test boundary.
- [P03 session and organization boundary](adr-002-p03-session-and-organization-boundary.md) — session authentication, membership roles, scoped product codes, and rollback limits.
- [P04 master-data ownership and rial pricing](adr-003-p04-master-data-ownership-and-pricing.md) — dual-role parties, same-organization relationships, explicit unknown units, and exact price amounts.
- [P05 Toman sales snapshots and order conversion](adr-004-p05-sales-currency-and-snapshots.md) — exact Rial-to-Toman conversion, snapshot timing, rounding, and idempotent order conversion.
- [P06 immutable stock ledger and stable key locks](adr-005-p06-stock-ledger-and-locks.md) — derived balances, exact thousandths, opening/correction policy, and MariaDB serialization.
