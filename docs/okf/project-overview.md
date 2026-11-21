---
type: Project
title: ERP Local Development Prototype
description: A local-only ERP application with accepted product data, Persian RTL workspace, organization access, and shared organization-scoped master data.
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
- P02 covers the workspace UI and product views. P03 adds session authentication, organization membership, role-scoped access, and an audit trail. P04 adds shared parties, units, products, warehouses, locations, and price lists. Sales, inventory, finance, production deployment, and external services remain outside the current phase.
- The existing repository root is the application root; no nested `erp/` directory should be created.

## Current phase

P01, P02, P03, and P04 are accepted. The application preserves existing product IDs and ownership, leaves unknown legacy units unset, and applies the session/membership reader/editor boundary to organization-owned master data. See the [project handoff](../../HANDOFF.md) for current validation. Browser evidence is in the [UI design reference](../UI_DESIGN.md).
