---
type: Architecture Decision
title: P04 Organization-Owned Master Data and Rial Pricing
description: Records P04 ownership constraints, legacy unit handling, dual-role parties, and exact price-list amounts.
tags:
  - decision
  - master-data
  - data
  - organization
status: accepted
---

# ADR-003: P04 Organization-Owned Master Data and Rial Pricing

## Decision

- Store one party record and store its customer/supplier roles as organization-scoped role rows. The same party may hold both roles.
- Keep every P04 master record organization-owned. Use composite organization foreign keys for product units, location warehouses, party roles, and price-list entries, alongside scoped API validation.
- Add a nullable product base unit. Existing P03 products keep an explicit unknown state until a user assigns a unit; the migration does not infer a business unit.
- Store a price-list entry as an unsigned integer rial amount keyed by list and product. Serialize the amount as a decimal string and display «ریال» without a toman conversion.
- Resolve a price from the explicitly selected list and product. Missing entries remain unpriced.

## Rationale

P04 introduces reusable reference data without starting sales, purchasing, stock, or accounting workflows. Organization-scoped relationships prevent same-database cross-organization association. Nullable legacy units preserve known P03 data without making an unsupported assumption. Integer rials preserve exact amounts for later phases.

## Consequences and limits

Price entries use the product base unit and remain denominated in rials. P05 later consumes a selected amount as exact tenths of a toman for sales snapshots; product unit conversion remains outside P05. Forward migration 000005 retains product IDs and owner values; rolling it back removes P04 records and the added base-unit column, so only the disposable test schema was used for rollback rehearsal.

See [P04 data model](../data/master-data.md), [API/workspace architecture](../architecture/p04-master-data.md), and [organization isolation](../security/p04-master-data-isolation.md).
