---
type: Project
title: ERP Local Development Prototype
description: A local-only ERP application with organization access, shared master data, sales and purchasing flows, stock operations, and a manual accounting journal engine.
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
- P02 covers the workspace UI and product views. P03 adds session authentication, organization membership, role-scoped access, and an audit trail. P04 adds shared parties, units, products, warehouses, locations, and Rial price lists. P05 adds leads, dated follow-ups, Toman quotes, and confirmed sales orders. P06 adds standalone stock operations, location balances, and reservations. P07 adds sales-order fulfillment links, partial delivery, and remainder cancellation. P08 adds purchase requests, separate-editor approval, supplier orders with whole-rial snapshots, and warehouse receipts. P09 adds organization-scoped books, accounts, fiscal periods, balanced manual journals, immutable posting, and reversals. P10 adds customer/supplier invoice, receivable/payable, treasury, allocation, and P09 journal links for the approved local synthetic ERP MVP mapping in ADR-008. Live/production posting remains disabled. Production deployment and external services remain outside scope.
- The existing repository root is the application root; no nested `erp/` directory should be created.

## Current phase

P01–P10 are accepted at their local-development boundaries. P10's local ERP MVP approval and exact organization/book/account mapping are recorded in [ADR-008](decisions/adr-008-p09-accounting-scope-and-posting-decisions.md); its existing `synthetic_test` profile remains unchanged. The focused guarded P10 suite passes 7 tests / 136 assertions, including exact journal account mappings and the closed-period correction boundary. The prior full guarded suite passed 85/945 before this approval-test update. Chrome verified the local synthetic customer/supplier journeys, source and treasury links, contention, responsive geometry, fallback, and Vite styling. Live/production posting remains disabled. P11 has not started. See the [project handoff](../../HANDOFF.md) for current validation and the [UI design reference](../UI_DESIGN.md) for screenshots.
