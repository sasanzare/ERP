---
type: Project
title: ERP Local Development Prototype
description: A local-only ERP application with accepted product data, reusable Persian RTL workspace, and session-authenticated organization-scoped product access.
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
- P02 covers the workspace UI and product views. P03 adds session authentication, organization membership, role-scoped product access, and an audit trail. Sales, inventory, finance, production deployment, and external services remain outside the current phase.
- The existing repository root is the application root; no nested `erp/` directory should be created.

## Current phase

P01, P02, and P03 are accepted. The application preserves the seeded product, backfills it to the documented starting organization, and enforces session authentication, current membership, and reader/editor product permissions. See the [project handoff](../../HANDOFF.md) for current validation and environment limits. Browser evidence for each accepted phase is in the [UI design reference](../UI_DESIGN.md).
