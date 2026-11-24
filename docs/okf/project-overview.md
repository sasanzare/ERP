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
- P02 covers the workspace UI and product views. P03 adds session authentication, organization membership, role-scoped access, and an audit trail. P04 adds shared parties, units, products, warehouses, locations, and Rial price lists. P05 adds leads, dated follow-ups, Toman quotes, and confirmed sales orders. P06 adds standalone stock operations, location balances, and reservations. P07 adds sales-order fulfillment links, partial delivery, and remainder cancellation. P08 adds purchase requests, separate-editor approval, supplier orders with whole-rial snapshots, and warehouse receipts. P09 adds organization-scoped books, accounts, fiscal periods, balanced manual journals, immutable posting, and reversals. Automatic source posting remains disabled while business recognition, account mapping, tax, and inventory-cost decisions are open. P10 supplier invoices/payables, production deployment, and external services remain outside scope.
- The existing repository root is the application root; no nested `erp/` directory should be created.

## Current phase

P01–P09 are accepted at their local-development boundaries. P09 migrations 000010–000011 were applied forward to existing `erp_dev`; all observed P01–P08 table counts matched before and after. The full guarded suite passed 78 tests / 825 assertions. Chrome verified the four balanced journal fixtures, reversal of the closed-period sale in an open 2027 period, same-key retry after closure, separate-connection posting contention, period-close/post serialization, keyboard focus, 1280×900 and 390×844 geometry, bright fallback, and live Vite stylesheet loading. Source-driven recognition remains gated by the open domain decisions in [ADR-008](decisions/adr-008-p09-accounting-scope-and-posting-decisions.md). See the [project handoff](../../HANDOFF.md) for current validation and the [UI design reference](../UI_DESIGN.md) for screenshots.
