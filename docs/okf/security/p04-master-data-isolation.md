---
type: Security Model
title: P04 Master Data Isolation
description: Defines the organization-scoped read, write, selector, and relationship validation boundaries for P04 master data.
tags:
  - security
  - organization
  - authorization
  - master-data
status: active
---

# P04 Master Data Isolation

## Organization ownership

The active organization comes from the P03 server session and persisted membership. API writes derive ownership from that organization and reject `organization_id` overrides. Reads, collection filters, details, writes, and relationship lookups apply the active organization scope before returning data or authorizing mutation.

Composite foreign keys back the application checks: a product base unit, location warehouse, party role, and price-list entry must share the owning organization. A foreign unit on a product and a foreign warehouse on a location are validation errors with no saved change. A location/product/list ID from another organization is hidden as not found.

## Role boundary

The P03 reader can open P04 registers/details and use the read-only location selector. Direct create/update/delete requests are denied by `OrganizationPolicy`. Editors can manage master records. UI capability flags control visible actions but are not the security boundary.

## Price lookup and selectors

The price endpoint takes both selected list and product after independently scoping each. Missing entries return an unpriced state. Price writes require a product base unit. Location options are filtered by a same-organization warehouse, and the server revalidates the selected warehouse/location pair even if a client submits a mismatched pair directly.

See [P03 organization access](organization-access.md), [P04 architecture](../architecture/p04-master-data.md), and [the P04 data model](../data/master-data.md).

## Verification

The guarded `erp_test` feature suite passed the P04 foreign-ID, reader, foreign-unit, wrong-warehouse, organization-switch, and no-write-after-rejection cases. Chrome additionally confirmed that the editor form is available, the reader form is disabled, reader direct writes return 403, and cross-organization selector results remain scoped.
