---
type: Architecture Decision
title: P06 Immutable Stock Ledger and Stable Key Locks
description: Records the source-of-truth, quantity representation, opening/correction policy, and MariaDB serialization strategy for P06.
tags:
  - decision
  - inventory
  - data
  - concurrency
status: accepted
---

# ADR-005: P06 Immutable Stock Ledger and Stable Key Locks

## Decision

- Store posted physical changes as immutable movement legs linked to one organization-scoped operation. A transfer has two legs under one operation and one database transaction.
- Store open/released reservations separately from physical movements. Derive physical, reserved, and available balances from the ledger and open reservations rather than persisting totals.
- Define a stock key as `(organization_id, product_id, location_id)` and express quantities as positive integer thousandths in the product's required base unit.
- Use a unique `stock_locks` row per stock key. Insert the row in the writer transaction before locking it so a first write has the same reliable lock target as later writes.
- Lock the product row, then location/warehouse rows, then stock keys in consistent ascending order. Use current locking reads for committed movement and reservation records before checking availability.
- Allow one opening operation only as the first movement for a key. Correct errors with a new receipt or issue; never alter the posted opening entry.
- Require organization-scoped idempotency keys for operation and reservation creation. Release is a one-way, idempotent transition.

## Rationale

A persisted total could drift from history after a partial failure. Deriving balances from immutable movements and reservation state keeps the history authoritative without a second aggregate to reconcile. The separate lock registry avoids a missing-row race when the first operation or reservation reaches a stock key concurrently. Integer thousandths preserve P05's three-decimal base-unit precision without floating-point arithmetic.

The product-row lock also serializes base-unit edits with stock writes. Location-row locks protect warehouse/location pairing. Transfers lock both location keys in sorted order and commit both legs together. Laravel retries deadlock victims three times; idempotency prevents a successful retry from repeating the movement.

## Consequences and boundaries

Operation writes for the same product are serialized at the product row as well as by stock key, which is conservative for this local prototype. P06 standalone reservations keep no sales-order-line relation and support complete release. P07 adds optional line ownership plus consumed/released counters and a delivery link table; the P06 release route rejects linked holds. P07 acquires the order-line lock before continuing through the P06 product/location/key/reservation order. Unit conversion, stock take, valuation, accounting, and production scale/performance qualification are not included.

See [P06 data](../data/p06-stock-balances.md), [P06 workflow](../architecture/p06-stock-workflow.md), [P06 isolation](../security/p06-stock-isolation.md), and [ADR-006](adr-006-p07-reserved-sales-order-issues.md).
