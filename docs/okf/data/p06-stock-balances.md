---
type: Data Model
title: P06 Stock Ledger, Balances, and Reservations
description: Records the organization/product/location stock key, exact quantity representation, opening rule, correction strategy, and derived balance equations.
tags:
  - data
  - inventory
  - balances
status: active
---

# P06 Stock Ledger, Balances, and Reservations

## Stock key and unit

The stock key is `(organization_id, product_id, location_id)`. Each posted operation and reservation also stores the product's non-null `base_unit_id` and label snapshots. A stock key is interpreted only in that base unit; P06 does not convert units. After the first successful stock write creates a stock-lock key, the product base unit cannot be changed through the P04 product update API.

Every product, unit, location, and movement relationship is constrained to the owning organization with composite foreign keys where supported by the existing schema. The application additionally checks the selected warehouse/location pair; sharing an organization does not make a mismatched pair valid.

## Ledger and operation legs

`inventory_operations` stores the organization, product, base unit, operation type, exact quantity in thousandths, actor, timestamp, idempotency key, and request hash. It also snapshots the product, unit, and from/to location labels. `inventory_movements` stores positive quantity legs with an `inbound` or `outbound` direction and references the parent operation.

Opening and receipt operations create one inbound leg. Issues create one outbound leg. A transfer creates an outbound source leg and an inbound destination leg under one operation ID and one transaction; equal source/destination locations are rejected. Posted operations and movement rows have no edit/delete route.

## Exact quantities

API quantities are decimal strings with at most three fractional digits. The service converts them to a signed-safe integer count of thousandths; the maximum supported quantity is `999999999.999`. Zero, negative values, excess precision, larger values, and non-string numeric inputs are rejected. Values are serialized with exactly three fractional digits. No floating-point arithmetic is used for storage, availability, or balance reconciliation.

A product without a base unit receives a clear `422` validation response. Existing `DEMO-001` records keep `base_unit_id = NULL`; `DEMO-002` and P05 demo products retain their established `EA` unit.

## Balance equation and negative-stock rule

No persisted balance totals are maintained. The API derives physical quantity from the immutable movement ledger and reserved quantity from open reservations:

```text
physical  = sum(inbound movement quantity) - sum(outbound movement quantity)
reserved  = sum(quantity for open reservations)
available = physical - reserved
```

An unreserved issue, outbound transfer, or new reservation is rejected if its quantity exceeds available stock. Receipt and transfer destination quantities are rejected if they exceed the supported physical quantity bound. Every accepted reservation therefore leaves `reserved <= physical` and `available >= 0`.

## Opening-stock and correction rules

An opening stock operation is allowed only when it is the first movement for that product/location key; it may be posted once. It records the initial counted quantity and is never edited or deleted. Correct an error by appending a receipt or issue for the difference, with the actor and timestamp preserved in the ledger. A physical stock take, reversal record, or adjustment-specific operation remains outside P06.

## Reservation lifecycle

Reservations hold a positive quantity against one organization/product/location/base-unit key. Creation checks availability under the stock-key lock and does not add a physical movement. Releasing records status, releasing actor, and timestamp in the same transaction as the protected balance read. Repeating release returns the released record without changing the timestamp or effective reserved quantity.

`stock_locks` is a serialization registry, not a balance cache. It has a unique organization/product/location key and is inserted before locking, so first writes also have a durable lock target. Because balances are derived, there is no cached total to reconcile; the live API and acceptance helpers independently sum the ledger/reservation rows.

See [P06 workflow](../architecture/p06-stock-workflow.md), [P06 security](../security/p06-stock-isolation.md), [ADR-005](../decisions/adr-005-p06-stock-ledger-and-locks.md), [P04 master data](master-data.md), and [P05 sales documents](p05-sales-documents.md).

## Migration and validation state

Migration `2026_11_21_000007_create_p06_inventory_tables` adds the lock registry, operation header, movement legs, and reservations without changing P04/P05 tables. It is applied to the existing `erp_dev` schema and was loaded by the guarded `erp_test` suite. Existing product IDs and base units were read before the development migration and remained unchanged after it.

The serial guarded suite passed 50 tests / 464 assertions. Chrome verified the exact reserve/release, transfer, last-unit race, issue/precision, organization/role, and responsive UI scenarios. On guarded `erp_test`, migration 000007 was rolled back and reapplied by path only. Before and after rollback, the P03–P05 table counts matched; representative rows retained organization ID 1, product ID 96/unit ID 40, party ID 28, warehouse/location IDs 25/24, price-list/entry IDs 22/30, and lead/quote IDs 8/8. The final serial suite then passed again after the schema refresh. Temporary probe rows were confined to `erp_test`; P06 development records remain in `erp_dev`.
