---
type: Project
title: ERP Local Development Prototype
description: A local-only ERP application with product and master data, organization access, sales documents, stock balances, and confirmed-order fulfillment.
tags:
  - project
  - local-development
status: active
---

# Project Overview

## Purpose

Establish a local ERP application that can be extended in later phases. P01's accepted data path is a Persian RTL React product page reading a synthetic product from a Laravel JSON endpoint backed by local MariaDB. P02 establishes the shared shell, product register, detail route, filter, dialog, and accessible Liquid Glass fallback.

## Boundaries

- The project is local development only and uses synthetic data.
- P02 covers the workspace UI and product views. P03 adds session authentication, organization membership, role-scoped access, and an audit trail. P04 adds shared parties, units, products, warehouses, locations, and Rial price lists. P05 adds leads, dated follow-ups, Toman quotes, and confirmed sales orders. P06 adds standalone stock operations, location balances, and reservations. P07 adds sales-order fulfillment links, partial delivery, and remainder cancellation. Finance, production deployment, and external services remain outside the current implementation.
- The existing repository root is the application root; no nested `erp/` directory should be created.

## Current phase

P01–P07 are accepted. P07's additive development migration, exact reservation/delivery/cancellation behavior, guarded full suite, live Chrome acceptance, and P07-only testing-schema rollback/reapply are verified. The P07 rollback/reapply preserved P06 inventory tables and its operation foreign key. P05 uses Toman snapshots while P04 price lists remain in rials. See the [project handoff](../../HANDOFF.md) for current validation. Browser evidence is in the [UI design reference](../UI_DESIGN.md).
