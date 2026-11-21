# Project Handoff

## Last Updated

2026-11-21

## Project Summary

Local-development-only ERP prototype using synthetic MariaDB data. P01–P07 are accepted at their local-development boundaries. Production, staging, cloud, finance, and external integrations remain out of scope.

## Current Objective

P07 — Fulfil a Confirmed Sales Order — is accepted. Stop here; do not begin P08 without a new request.

## Current Phase or Milestone

P07 connects confirmed P05 order lines to P06 reservations and immutable outbound issues. It supports exact partial deliveries, operation/movement trace links, and cancellation of an unfulfilled remainder without a movement. P05 price, discount, source quote, and total snapshots remain unchanged.

## Repository State

- Repository path: `D:\All projects\ERP`
- Current branch: `main`
- Base or starting commit: `dc0c130abd7b251d9a77909a7f66c56d0bab3012`
- Current HEAD: `dc0c130abd7b251d9a77909a7f66c56d0bab3012`
- Working tree status: P07 changes are unstaged on `main`. The worktree was clean at task start. Git fsmonitor IPC was unavailable; status was inspected with `core.fsmonitor=false`.
- Staged changes: none
- Unstaged changes: see Files Modified.
- Untracked files: see Files Created.

## Completed Work

- Added organization-scoped Reserve, Deliver, and Cancel Remainder actions. Product and unit are derived from the locked order line; incompatible current base units fail validation.
- Preserved the original reservation quantity and tracked consumed/released thousandths separately. P06 balances count outstanding amounts only.
- Posted issue operation, outbound movement, delivery link, and reservation consumption atomically. Delivery retry is payload-bound; changed payload returns 409. The P06 release route rejects line-managed reservations.
- Added Persian order-line quantity/history UI and links to the stock operation and movement records.
- Added P07 feature coverage, a Chrome acceptance harness, P07 OKF concepts/ADR, README/UI evidence, and the migration rollback fix.
- Reviewed and updated the fingerprint-verified ERP mistakes log. Appended one P07 event to the local Notion queue; it remains pending and no Notion API was called.

## Work in Progress

None for P07. `npm run dev` remains running on ports 8000 and 5173. The Compose MariaDB service is healthy.

## Remaining Work

No P07 acceptance work remains. P08 has not started.

## Exact Next Steps

1. If P08 is requested, reuse P06 stock options, exact quantity helpers, stock-key locking, and the `receipt` operation while adding purchase-order-specific traceability.
2. Before new work, inspect Git and this handoff. Do not stage or commit unless asked.

## Files Created

- `app/Models/SalesOrderDelivery.php`
- `app/Services/Sales/SalesFulfillmentService.php`
- `database/migrations/2026_11_21_000008_add_p07_sales_fulfillment.php`
- `tests/Feature/P07SalesFulfillmentTest.php` and `scripts/Verify-P07Browser.mjs`
- P07 OKF architecture/data/security/ADR-006 documents.
- Five final P07 screenshots linked from `docs/UI_DESIGN.md#p07-sales-fulfillment-evidence`.

## Files Modified

- `AGENTS.md`, `HANDOFF.md`, `README.md`, `docs/UI_DESIGN.md`, `routes/api.php`.
- API controllers `SalesController.php`, `SalesOrderController.php`, and `StockController.php`.
- Models `InventoryMovement.php`, `InventoryOperation.php`, `SalesOrderLine.php`, and `StockReservation.php`.
- `app/Services/Stock/StockService.php`.
- `resources/css/products.css`, sales/stock API types, and sales/stock React screens.
- OKF root/indexes, local architecture, P05/P06 architecture/data/security/ADR documents, project overview, and maintenance log.

## Important Architecture and Design Decisions

- Keep reservation original quantity immutable; `outstanding = original - consumed - released`.
- Lock order: `sales_order_line → product → sorted warehouse/location → stock key → reservation`. P07 cancellation processes linked reservations by location ID then reservation ID.
- A reserved issue validates reservation outstanding and physical stock, not unreserved availability. Issue, movement, delivery trace, and consumption commit together.
- Delivery idempotency binds the key to order, line, reservation, and quantity. Cancellation is line-locked, idempotent, and creates no movement.
- P06 standalone release refuses line-linked reservations. P05 commercial snapshots are unchanged.

## Commands Executed

- `docker compose up -d --wait db` — existing DB service reported healthy; volume retained.
- `C:\php8.5\php.exe artisan migrate --force` — applied 000008 to existing `erp_dev`.
- `npm run dev` — Laravel 8000 and Vite 5173; session remains active.
- `php artisan route:list --path=api/v1/sales-orders` — read/write routes registered.
- `php artisan test --filter=P07SalesFulfillmentTest` — 5 tests / 101 assertions passed.
- `php artisan test` — final guarded serial run passed 55 tests / 565 assertions after rollback/reapply.
- `npm run typecheck`, `npm run build`, changed-file `vendor/bin/pint --test`, PHP syntax checks, `git diff --check`, and OKF validation passed.
- `node scripts/Verify-P07Browser.mjs` — Chrome screenshots, keyboard/fallback, and two-connection retry/contention checks passed.
- P07-only `artisan migrate:rollback` and `artisan migrate` on `--env=testing` with the 000008 migration path completed.

## Validation and Test Results

- Canonical physical/reserved/available snapshots: `10.000/0.000/10.000 → 10.000/3.000/7.000 → 8.000/1.000/7.000 → 8.000/0.000/8.000`.
- Main browser fixture: order 8, line 10, product 11, reservation 9, delivery 3, operation 14, outbound movement 15. Final line is ordered 3.000, delivered 2.000, cancelled 1.000, pending 0.000; total remains 300,000 toman.
- Two independent requests using the same delivery key/payload returned 201/200 and one delivery/operation. Changed payload returned 409; excess new delivery returned 422.
- Access and failure coverage includes reader 403, foreign/unrelated IDs 404, CSRF 419, controlled atomic failure, and normal standalone P06 release/issue.
- Chrome 1280×900 and 390×844: visible Tab focus, no mobile horizontal overflow (document/client widths both 375 CSS px), forced fallback with 3 glass surfaces and 0 SVG refraction surfaces, 0 browser runtime errors.
- OKF validation: 29 Markdown files, 23 frontmatter-bearing documents, 138 internal links; root OKF 0.2 only.

## Known Issues and Blockers

- No P07 blocker remains. The user's existing Chrome profile had no ERP session, so direct `/orders/8` navigation redirected to the local sign-in page. The isolated Chrome acceptance harness used the ignored synthetic editor credentials.
- The local Laravel server logged non-fatal `EBUSY` watcher warnings while temporary Chrome profile lock files were under `storage/framework/testing`; browser acceptance completed with 0 runtime errors.
- The requested GPT-6 Luna/max execution profile was not exposed for verification.

## Risks and Assumptions

- Synthetic browser fixtures remain in `erp_dev`: 7 P07 products, warehouses, locations, order lines, and linked reservations; 4 deliveries. No P07-linked reservation is open. Existing fixtures were not reset.
- Results establish local development behavior only.

## Database or Migration State

- `erp_dev`: migration `2026_11_21_000008_add_p07_sales_fulfillment` is applied to the existing `erp_mariadb_data` volume.
- `erp_test`: P01–P07 migrations are applied after P07-only rollback/reapply; the suite uses the repository `DatabaseTestSafetyGuard`.

## Configuration and Environment Notes

- `.env`, `.env.testing`, and examples were not changed. PHP 8.5.13 is at `C:\php8.5\php.exe`; MariaDB uses loopback port 3307.
- The normal command sandbox cannot reach the DB host port; database/Docker commands were run through the permitted elevated path.
- Stop the active local Laravel/Vite session with Ctrl+C in its `npm run dev` session.

## Uncommitted or Partially Applied Changes

- All P07 changes are unstaged on `main`; nothing is staged, committed, or pushed.
- No migration is partially applied. P07 is applied in both `erp_dev` and `erp_test`.
- Event `erp-p07-sales-order-fulfillment-20261121T172436Z-82e0d709-8890-4ab4-a65d-ed3df03b9d37` was appended to `D:\All projects\notion\notion.md` with `sync_state=PENDING`; the event and lock cleanup were read back. No remote sync was done.

## Recovery or Rollback Notes

- Do not roll back `erp_dev`; it contains preserved P01–P06 data and accepted synthetic P07 fixtures.
- The verified P07-only test command is `artisan migrate:rollback --database=mariadb --path=database/migrations/2026_11_21_000008_add_p07_sales_fulfillment.php --env=testing --force`. It removes P07 fields/table, preserves P06 tables, and restores the P06 operation FK/support index. Reapply only against guarded `erp_test`.
- Do not run `migrate:fresh`, reset the MariaDB volume, or delete generated evidence.

## Related Documentation

- [Project instructions](AGENTS.md), [README/runbook](README.md), [phase roadmap](docs/MASTER_PLAN.md), [OKF index](docs/okf/index.md), [UI evidence](docs/UI_DESIGN.md#p07-sales-fulfillment-evidence).
- [P07 workflow](docs/okf/architecture/p07-sales-fulfillment.md), [data](docs/okf/data/p07-sales-fulfillment.md), [security](docs/okf/security/p07-sales-fulfillment.md), and [ADR-006](docs/okf/decisions/adr-006-p07-reserved-sales-order-issues.md).

## Notes for the Next Agent

P07 is accepted and P08 is not started. Preserve the synthetic fixtures and local environment. P08 should reuse the P06 receipt/stock interface while keeping purchase-order relations in its own scope. Notion reporting is local-only and pending explicit sync.
