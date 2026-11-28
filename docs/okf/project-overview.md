---
type: Project
title: ERP Local Development Prototype
description: A local-development ERP prototype with an explicitly approved, phase-gated internal project-centric V2 scope and existing organization, goods, finance, project-work, and administration modules.
tags:
  - project
  - local-development
status: active
---

# Project Overview

## Purpose

Establish a local ERP application that can be extended in later phases. P01's accepted data path is a Persian RTL React product page reading a synthetic product from a Laravel JSON endpoint backed by local MariaDB. P02 establishes the shared shell, product register, detail route, filter, dialog, and accessible Liquid Glass fallback.

The CEO / Project Owner approved D01 on 2026-11-28: V2 is an internal, project-centric ERP for NoSyntax, following a Modular Monolith direction with the existing Laravel/React/TypeScript/MariaDB stack. Development remains one explicitly authorized phase at a time. The current V2 plan file is `docs/NoSyntax_ERP_MASTER_PLAN_V2_FA.md`; the named English path `docs/MASTER_PLAN_V2.md` is absent. The customer portal remains a separate milestone after internal ERP acceptance. D02-D14 remain open; this approval does not authorize P15 execution, deployment, production access, real financial posting, external services, destructive data operations, or restricted Git operations. See [ADR-010](decisions/adr-010-v2-scope-and-governance.md).

## Boundaries

- The project is local development only and uses synthetic data.
- P12 adds organization-owned projects and tasks, plain-text comments, a signed-in user's assigned-work inbox, local due reminders, and a traceable link from each committed project purchase cost to one P08 order line. Live/production posting remains disabled.
- P13 adds organization-scoped membership-role administration with a separately provisioned local role-manager grant, scoped role audit history, and create-only party CSV/XLSX import plus filtered CSV export. P13 does not enable live/production authorization or deployment.
- P02 covers the workspace UI and product views. P03 adds session authentication, organization membership, role-scoped access, and an audit trail. P04 adds shared parties, units, products, warehouses, locations, and Rial price lists. P05 adds leads, dated follow-ups, Toman quotes, and confirmed sales orders. P06 adds standalone stock operations, location balances, and reservations. P07 adds sales-order fulfillment links, partial delivery, and remainder cancellation. P08 adds purchase requests, separate-editor approval, supplier orders with whole-rial snapshots, and warehouse receipts. P09 adds organization-scoped books, accounts, fiscal periods, balanced manual journals, immutable posting, and reversals. P10 adds customer/supplier invoice, receivable/payable, treasury, allocation, and P09 journal links for the approved local synthetic ERP MVP mapping in ADR-008. P11 adds read-only, organization-scoped reconciled reporting plus a repeatable local synthetic walkthrough. Live/production posting remains disabled. Production deployment and external services remain outside scope.
- The existing repository root is the application root; no nested `erp/` directory should be created.

## Current phase

P14 is PASS after the explicit D01 owner approval and its recording in [ADR-010](decisions/adr-010-v2-scope-and-governance.md). Its evidence limitations are retained in the [P14 acceptance report](../acceptance/v2/P14/report.md). P15 is READY — AWAITING EXPLICIT EXECUTION AUTHORIZATION and has not started. D02-D14 remain open.

P01–P13 are accepted at their local-development boundaries. P10's local ERP MVP approval and exact organization/book/account mapping are recorded in [ADR-008](decisions/adr-008-p09-accounting-scope-and-posting-decisions.md); its existing `synthetic_test` profile remains unchanged. The focused guarded P10 suite passes 7 tests / 136 assertions, including exact journal account mappings and the closed-period correction boundary. The focused guarded P11 suite passes 5 tests / 122 assertions, and its full serial guarded suite passed 90 tests / 1,083 assertions. P11 covers independently reconciled metrics, dated allocation/movement/approval boundaries, 29-row approval pagination, same/foreign book and organization scope, denied access, and replaying provisioning twice in `erp_test`. The local command also ran twice against `erp_dev` without changing its established profile or existing manual journals. Chrome readback at organization `legacy-local`, book `P10-SYNTH-BROWSER`, date 2026-11-26 matched 5,000,000 IRR sales, 600,000 IRR overdue receivables, 131.500 EA available stock, and one pending approval. P12's focused suite passed 7 tests / 133 assertions and the full serial guarded suite passed 97 / 1,216. Its Chrome acceptance verified the assigned-editor inbox and completion journey, one persistent due reminder under repeat processing, exact 500,000-rial P08 line trace, desktop/mobile/fallback, keyboard focus, and live Vite CSS with zero runtime errors. P13's full serial guarded suite passed 110 tests / 1,344 assertions; its Chrome acceptance verified one audited reader→editor change, CSV/XLSX preview parity, create-only retry, 29 matching filtered export IDs, live Vite styling, mobile dock clearance, visible keyboard focus, and bright forced fallback. P13 migration 000014 was additive and preserved preexisting `erp_dev` counts. TypeScript, build, changed-file Pint, Composer validation, PHP/Node syntax, and diff checks passed. See the [P13 architecture](architecture/p13-administration-and-data-exchange.md), [P13 data model](data/p13-administration-and-data-exchange.md), [P13 access model](security/p13-administration-and-data-exchange.md), [ADR-009](decisions/adr-009-p13-role-management.md), [P13 UI evidence](../UI_DESIGN.md#p13-administration-and-data-exchange-evidence), [handoff](../../HANDOFF.md), and [P12 project-work model](data/p12-project-work.md). Live/production posting remains disabled.
