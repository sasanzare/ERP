---
type: Architecture
title: Local Runtime Architecture
description: Records the actual local application topology, organization boundaries, sales workflow, and partial P06 stock workflow.
tags:
  - architecture
  - runtime
status: active
---

# Local Runtime Architecture

## Implementation state

The Laravel 13 application and P01 source/configuration are at the repository root. Composer and npm dependencies are locked and installed. P01–P06 are accepted after validating their migrations, repeatable provisioning, browser/API paths, and Persian RTL workspaces. P06 includes an immutable stock ledger, location balances/reservations, concurrency controls, and verified P05-to-P06 rollback/reapply on `erp_test`. P03 session, organization, membership, policy, and audit behavior remain the authorization base. P04 adds organization-owned master data and P05 adds sales documents.

## Implemented P01 topology

- Laravel Framework 13.43.0 serves the Blade browser entry and `/api/v1/products` from host-side PHP 8.5.13.
- React 19.3.1, TypeScript 5.9.3, and Vite 8.3.8 sources live under `resources/js/`; Vite serves development assets and hot reload.
- `npm run dev` runs `scripts/Run-LocalDev.mjs`, which starts Laravel's loopback server on port 8000 and Vite on port 5173, forwards Ctrl+C to both, and leaves Docker/MariaDB lifecycle to the developer. `ERP_PHP_BINARY` can select the host PHP executable; the default is `C:\php8.5\php.exe`.
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
- P04 migration `2026_11_20_000005_create_p04_master_data_tables` adds parties/roles, units, warehouses, locations, price lists/entries, and an optional product base unit. Existing product IDs, owners, codes, and names were read before and after the `erp_dev` migration and remained unchanged. Unknown legacy units stay `NULL`.
- P04 API controllers scope reads, writes, filters, and relationships to the active organization. Composite foreign keys protect product units, location warehouses, party roles, and list entries. `OrganizationPolicy` permits readers to view and editors to manage master data.
- P04 React routes use one shared register/form pattern for `/parties`, `/units`, `/warehouses`, `/locations`, and `/price-lists`; the existing `/products` route keeps its collection response and adds product create/base-unit editing. Selected-list price resolution is a dedicated endpoint and exact rial amounts are returned as strings.
- The existing `p03:provision-demo` command also provisions repeatable P04 fixtures. On `erp_dev`, two consecutive runs retained 2 organizations, 3 memberships, 3 role-audit rows, 3 products, 1 party with 2 roles, 3 units across two organizations, 2 warehouses, 2 locations, 2 price lists, and 2 price entries.
- P05 adds organization-scoped leads, activities, quotes, and confirmed orders. P04 prices remain exact rials while P05 document snapshots use integer tenths of a toman and thousandth-unit quantities; quote conversion is transactional and idempotent.
- P06 adds `inventory_operations`, immutable `inventory_movements`, `stock_reservations`, and a unique `(organization_id, product_id, location_id)` `stock_locks` registry. Balances are derived from inbound/outbound legs and open reservations. The local dev migration is applied and the accepted fixtures keep product IDs/units 1–5 unchanged.
- The P06 workspace uses `/stock`, `/stock/movements`, and `/stock/reservations`; API writes require an editor role, explicit CSRF, and organization-unique idempotency UUID. MariaDB writers lock product and location rows plus sorted stock-key rows; P06 does not add sales-order-line links, which remain P07 work.

The framework version follows the user's direction to use the latest Laravel release. PHP 8.5.13 is installed at `C:\php8.5`; the user removed the old `C:\php-8.2` directory. MariaDB 11.8.9 was healthy during P06 verification, and product IDs/base units remained unchanged through migration 000007. On this Windows host, Docker commands require an elevated PowerShell because normal Docker Desktop pipe access is denied. See [Laravel 13 support requirements](https://laravel.com/framework/docs/13.x/releases), the [P06 workflow](p06-stock-workflow.md), and [project handoff](../../../HANDOFF.md).

The test schema is disposable and separate from the development schema. The guard runs before `RefreshDatabase` and rejects `erp_dev`; see [the P01 stack and isolation decision](../decisions/adr-001-p01-stack-and-isolation.md).
