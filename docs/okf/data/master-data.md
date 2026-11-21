---
type: Data Model
title: P04 Shared Master Data
description: Records the organization-scoped P04 party, product/unit, warehouse/location, and price-list data model.
tags:
  - data
  - master-data
  - organization
status: active
---

# P04 Shared Master Data

## Ownership and codes

Every master record is owned by the server-resolved active organization. The API does not accept `organization_id` as an ownership source. Codes are unique within an organization. The existing product unique constraint remains on (`organization_id`, `code`), so separate organizations can retain `DEMO-001`.

The migration adds composite organization/id keys and foreign keys where a relationship must remain within the same organization. These cover party roles, product base units, warehouse locations, and price-list entries.

## Records

| Record | Table | Key relationships |
|---|---|---|
| Party | `parties` | One party row may own both `customer` and `supplier` rows in `party_roles`; role filters return the same party ID. |
| Unit | `units` | A product's optional `base_unit_id` refers to a unit in the same organization. |
| Product | `products` | Existing `id`, `code`, and `name` remain; `base_unit_id` extends the record. |
| Warehouse | `warehouses` | Organization-owned storage location parent. |
| Location | `locations` | Organization-owned and references a warehouse in the same organization. |
| Price list | `price_lists` | Organization-owned list with entries keyed by product. |
| Price entry | `price_list_entries` | One amount for one product in one price list, all within the same organization. |

## Legacy product units

P03 had no unit information. The P04 migration deliberately leaves `products.base_unit_id` nullable and does not assign a guessed unit to existing products. Product detail shows an unassigned state. A price entry may be saved only after the product has an authorized base unit.

## Rial representation

`price_list_entries.amount_rial` is MariaDB `BIGINT UNSIGNED`. The API accepts decimal digit strings and serializes exact amounts as strings to avoid floating-point conversion. The UI displays amounts with Persian digits and an explicit «ریال» label. A missing product/list entry is returned as `priced: false` with `amount_rial: null`.

Prices are resolved from the explicitly selected price list and product. Entries are in the product's base unit. Unit conversions, discounts, and quote/order price snapshots belong to later phases.

See [P04 master-data routes](../architecture/p04-master-data.md), [organization isolation](../security/p04-master-data-isolation.md), and [ADR-003](../decisions/adr-003-p04-master-data-ownership-and-pricing.md).

## Migration and verification

Forward migration `2026_11_20_000005_create_p04_master_data_tables` adds the P04 tables and nullable product unit relationship. On the existing `erp_dev`, product IDs 1 and 2, their organization IDs, codes, and names were read before and after migration and remained unchanged. Both legacy products retain `base_unit_id = NULL`.

The P04 migration was rolled back and reapplied only on guarded `erp_test`. The P03 `products.organization_id` column remained after rollback. The guarded Laravel suite uses `erp_test` and passed 36 tests / 213 assertions.
