---
type: Architecture
title: Local Runtime Architecture
description: Records the actual local application topology, organization boundaries, and P04–P09 business, inventory, and accounting integrations.
tags:
  - architecture
  - runtime
status: active
---

# Local Runtime Architecture

## Implementation state

The Laravel 13 application and P01 source/configuration are at the repository root. Composer and npm dependencies are locked and installed. P01–P09 are accepted at their local-development boundaries after validating migrations, repeatable provisioning, browser/API paths, and Persian RTL workspaces. P06 includes an immutable stock ledger, location balances/reservations, and concurrency controls. P07 connects confirmed order lines to those reservations and issues with partial delivery, cancellation, and operation/movement traceability. P08 adds independent purchase approval, supplier-order price snapshots, and atomic partial inbound receipts. P09 adds a manual balanced-journal engine with books, accounts, periods, retries, closures, and reversals. P03 session, organization, membership, policy, and audit behavior remain the authorization base.

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
- The P06 workspace uses `/stock`, `/stock/movements`, and `/stock/reservations`; API writes require an editor role, explicit CSRF, and organization-unique idempotency UUID. MariaDB writers lock product and location rows plus sorted stock-key rows.
- P07 migration `2026_11_21_000008_add_p07_sales_fulfillment` adds reservation ownership/counters, line cancellation state, a delivery trace table, and operation/movement keys. Sales fulfillment locks the order line before following the P06 product/location/stock-key/reservation order. Delivery posts one outbound issue and delivery trace atomically; cancellation releases the unfulfilled reservation remainder without a movement. P06 standalone release rejects line-managed reservations.
- P08 migration `2026_11_21_000009_create_p08_purchase_tables` adds organization-scoped request, request-line, order, order-line, and receipt records. One approved request converts to at most one order; source-line product/unit/quantity and supplier/price/total values are saved as historical snapshots. Purchase prices are whole IRR per base unit; each line rounds half-up once to whole rials and the order total sums the rounded lines.
- The P08 workspace is `/purchase-requests` and `/purchase-orders`. A requester cannot approve their own request. Receipt submission derives product/unit from the saved order line, adds an optional source scope to the P06 operation hash, and locks order → line → product → warehouse/location → stock key. A final unit/outstanding check, P06 inbound operation/movement, receipt link, received counter, and order closeout commit atomically. P06 standalone receipt remains available.

## Implemented P09 accounting

- Migrations `2026_11_22_000010_create_p09_accounting_tables` and `2026_11_22_000011_add_p09_one_sided_line_amount_check` add organization-owned books/accounts/periods, journals/lines, and request-key records. Composite foreign keys keep accounts, periods, journals, reversals, and retry keys within one organization and book. A MariaDB CHECK enforces one positive debit or credit per line.
- The workspace is `/accounting/journals`, with `/accounting/journals/new` and `/accounting/journals/{id}` for draft entry and review. Editors set up books, accounts, and non-overlapping inclusive Gregorian periods; readers can review. Periods record an IANA timezone (local default `Asia/Tehran`), and accounting dates are date-only.
- Posting requires a nonzero exact balance, active postable same-book accounts, and exactly one open period. Book-first transaction locks serialize posting, period creation/closure, and reversal. Successful posting/reversal keys return persisted records after closure; one unique original relation prevents a second reversal. Posted headers/lines have no update/delete route.
- P09 stores whole-rial amounts and emits exact decimal strings. P05 Toman snapshots convert by exact ×10 only when explicitly selected; P08 purchase snapshots remain rials. Existing P05/P06/P07/P08 workflows do not post automatically. The internal P10 action requires callers to resolve source records in the active organization, and affected source posting remains gated by [ADR-008](../decisions/adr-008-p09-accounting-scope-and-posting-decisions.md).

The framework version follows the user's direction to use the latest Laravel release. PHP 8.5.13 is installed at `C:\php8.5`; the user removed the old `C:\php-8.2` directory. P09 migrations 000010–000011 are applied forward on the existing `erp_dev` volume; the observed P01–P08 table counts matched before and after. Guarded `erp_test` includes migrations through 000011, and the full guarded suite passed 78 tests / 825 assertions. Chrome passed the P09 synthetic posting, retry, reversal, period-close race, mobile, fallback, and Vite checks with zero runtime errors. On this Windows host, Docker commands require an elevated PowerShell because normal Docker Desktop pipe access is denied. See [Laravel 13 support requirements](https://laravel.com/docs/13.x/releases), [P06 workflow](p06-stock-workflow.md), [P07 workflow](p07-sales-fulfillment.md), [P08 purchasing](p08-purchasing.md), [P09 accounting](p09-accounting.md), [P08 decision](../decisions/adr-007-p08-purchase-approval-and-pricing.md), [P09 decisions](../decisions/adr-008-p09-accounting-scope-and-posting-decisions.md), and [project handoff](../../../HANDOFF.md).

The test schema is disposable and separate from the development schema. The guard runs before `RefreshDatabase` and rejects `erp_dev`; see [the P01 stack and isolation decision](../decisions/adr-001-p01-stack-and-isolation.md).
