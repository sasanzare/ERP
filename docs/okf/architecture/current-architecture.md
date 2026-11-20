---
type: Architecture
title: Local Runtime Architecture
description: Records the actual application state and topology for the local product journey and reusable P02 workspace.
tags:
  - architecture
  - runtime
status: active
---

# Local Runtime Architecture

## Implementation state

The Laravel 13 application and P01 source/configuration are at the repository root. Composer and npm dependencies are locked and installed. P01, P02, and P03 were accepted after verifying MariaDB, migrations, repeatable seeding, the browser/API path, and the reusable RTL workspace described in [P02 workspace architecture](ui-workspace.md). P03 session, organization, membership, policy, audit, and workspace UI are implemented and validated.

## Implemented P01 topology

- Laravel Framework 13.43.0 serves the Blade browser entry and `/api/v1/products` from host-side PHP 8.5.13.
- React 19.3.1, TypeScript 5.9.3, and Vite 8.3.8 sources live under `resources/js/`; Vite serves development assets and hot reload.
- The product API serializes `id`, `code`, and Persian `name` from the Eloquent Product model backed by MariaDB.
- MariaDB is configured as Compose service `db` with image `mariadb:11.8.9-noble`, a health check, and persistent volume `erp_mariadb_data`.
- Host PHP uses loopback and configurable `DB_FORWARD_PORT` defaulting to 3307; container port is 3306.
- Compose initializes development schema/user `erp_dev`/`erp_app`; an idempotent init script creates test schema/user `erp_test`/`erp_test`. Each account is scoped to its own schema.
- Before Laravel's `RefreshDatabase` trait runs, the shared test case validates `APP_ENV`, MariaDB driver, loopback host, matching local port, exact `erp_test` database/user, and absence of URL/socket overrides. A non-destructive unit test verifies that `erp_dev` is rejected.
- The React product surface uses the Liquid Glass template's measured inverse-lens displacement map, geometry-based caching, a solid/tinted reduced-transparency fallback, and reduced-motion/contrast handling. Query `?glass=fallback` forces the fallback for visual QA.
- The P02 React shell serves `/`, `/products`, and numeric `/products/{id}` entry paths. It keeps `GET /api/v1/products` and its `{id, code, name}` record fields unchanged; list filtering and detail selection happen client-side. See [the P02 workspace architecture](ui-workspace.md) and [UI design reference](../../UI_DESIGN.md).
- P03 protects browser workspace routes with Laravel session authentication and redirects guests to `/sign-in`. API workspace routes add the `web` middleware group for sessions and apply an explicit token check to state-changing requests.
- The organization and product migrations backfill existing products to `legacy-local` (`سازمان پیش‌فرض`) before making `organization_id` required; product code uniqueness is scoped to organization. The forward migrations were applied to the existing local database, and product ID 1 was preserved.
- P03 organization context is resolved from current user memberships on each protected request. Product listing and numeric-ID update queries are organization-scoped, and the product policy permits updates only for the `editor` membership role.

The framework version follows the user's direction to use the latest Laravel release. PHP 8.5.13 is installed at `C:\php8.5`; the user removed the old `C:\php-8.2` directory. MariaDB 11.8.9 is healthy, and product ID 1 persisted across a container restart without reseeding. The API returned HTTP 200 and the guarded feature tests passed. On this Windows host, Docker commands require an elevated PowerShell because normal Docker Desktop pipe access is denied. See [Laravel 13 support requirements](https://laravel.com/framework/docs/13.x/releases) and the [project handoff](../../../HANDOFF.md).

The test schema is disposable and separate from the development schema. The guard runs before `RefreshDatabase` and rejects `erp_dev`; see [the P01 stack and isolation decision](../decisions/adr-001-p01-stack-and-isolation.md).
