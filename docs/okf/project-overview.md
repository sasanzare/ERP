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
- P12 adds organization-owned projects and tasks, plain-text comments, a signed-in user's assigned-work inbox, local due reminders, and a traceable link from each committed project purchase cost to one P08 order line. Live/production posting remains disabled.
- P02 covers the workspace UI and product views. P03 adds session authentication, organization membership, role-scoped access, and an audit trail. P04 adds shared parties, units, products, warehouses, locations, and Rial price lists. P05 adds leads, dated follow-ups, Toman quotes, and confirmed sales orders. P06 adds standalone stock operations, location balances, and reservations. P07 adds sales-order fulfillment links, partial delivery, and remainder cancellation. P08 adds purchase requests, separate-editor approval, supplier orders with whole-rial snapshots, and warehouse receipts. P09 adds organization-scoped books, accounts, fiscal periods, balanced manual journals, immutable posting, and reversals. P10 adds customer/supplier invoice, receivable/payable, treasury, allocation, and P09 journal links for the approved local synthetic ERP MVP mapping in ADR-008. P11 adds read-only, organization-scoped reconciled reporting plus a repeatable local synthetic walkthrough. Live/production posting remains disabled. Production deployment and external services remain outside scope.
- The existing repository root is the application root; no nested `erp/` directory should be created.

## Current phase

P01–P12 are accepted at their local-development boundaries. P10's local ERP MVP approval and exact organization/book/account mapping are recorded in [ADR-008](decisions/adr-008-p09-accounting-scope-and-posting-decisions.md); its existing `synthetic_test` profile remains unchanged. The focused guarded P10 suite passes 7 tests / 136 assertions, including exact journal account mappings and the closed-period correction boundary. The focused guarded P11 suite passes 5 tests / 122 assertions, and its full serial guarded suite passed 90 tests / 1,083 assertions. P11 covers independently reconciled metrics, dated allocation/movement/approval boundaries, 29-row approval pagination, same/foreign book and organization scope, denied access, and replaying provisioning twice in `erp_test`. The local command also ran twice against `erp_dev` without changing its established profile or existing manual journals. Chrome readback at organization `legacy-local`, book `P10-SYNTH-BROWSER`, date 2026-11-26 matched 5,000,000 IRR sales, 600,000 IRR overdue receivables, 131.500 EA available stock, and one pending approval. P12's focused suite passed 7 tests / 133 assertions and the full serial guarded suite passed 97 / 1,216. Its Chrome acceptance verified the assigned-editor inbox and completion journey, one persistent due reminder under repeat processing, exact 500,000-rial P08 line trace, desktop/mobile/fallback, keyboard focus, and live Vite CSS with zero runtime errors. TypeScript, build, changed-file Pint, PHP/Node syntax, and diff checks passed. See the [P12 project-work model](data/p12-project-work.md), [P12 access model](security/p12-project-work.md), [handoff](../../HANDOFF.md), and [UI evidence](../UI_DESIGN.md#p12-projects-and-assigned-work-evidence). Live/production posting remains disabled.
