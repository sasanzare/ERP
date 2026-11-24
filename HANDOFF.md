# Project Handoff

## Last Updated

2026-11-24

## Project Summary

Local-development-only ERP prototype using synthetic MariaDB data. P01–P09 are accepted at their local-development boundaries. P10 supplier invoices/payables, production, staging, cloud, and external integrations remain out of scope.

## Current Objective

P09 — Balanced Accounting Engine — is accepted at the local manual/synthetic boundary. Source-driven postings remain gated on domain-owner decisions for recognition triggers, account mappings, tax, inventory costing, cash/bank settlement, and real closed-period correction policy.

## Current Phase or Milestone

P08 is the accepted baseline. P09 rule/architecture/data/security documents, two forward migrations, models, exact Rial calculator, service, controller, routes, Persian React workspace, tests, Chrome harness, and screenshots are present. Full guarded tests and local Chrome acceptance passed. Migrations 000010–000011 are applied to existing `erp_dev`; observed P01–P08 row counts match the pre-migration baseline. Source-driven posting remains disabled. The pre-existing P08 work remains preserved.

## Repository State

- Repository path: `D:\All projects\ERP`
- Current branch: `main`
- Base or starting commit: `f876fc5ecbfe17fc5d5071ae303fb2a3087fd861`
- Current HEAD: `f876fc5ecbfe17fc5d5071ae303fb2a3087fd861` (`feat(sales): implement confirmed order fulfillment`)
- Working tree status: pre-existing P08 changes plus accepted but uncommitted P09 source/docs/evidence are present unstaged and untracked on `main` at the original `f876fc5` HEAD. P07 is committed at HEAD. `git -c core.fsmonitor=false status --porcelain=v2 --branch` was used because the initial status command reported a Git fsmonitor IPC error.
- Staged changes: none
- Unstaged changes: P08 implementation plus P09 edits to AGENTS, HANDOFF, policies, routes, React app/shell, and OKF indexes.
- Untracked files: P08 models/services/controller/migration/tests/browser scripts/OKF concepts/screenshots plus P09 models/services/controller/migration/React API-screen-CSS/OKF concepts.

## Completed Work

- Added organization-scoped Reserve, Deliver, and Cancel Remainder actions. Product and unit are derived from the locked order line; incompatible current base units fail validation.
- Preserved the original reservation quantity and tracked consumed/released thousandths separately. P06 balances count outstanding amounts only.
- Posted issue operation, outbound movement, delivery link, and reservation consumption atomically. Delivery retry is payload-bound; changed payload returns 409. The P06 release route rejects line-managed reservations.
- Added Persian order-line quantity/history UI and links to the stock operation and movement records.
- Added P07 feature coverage, a Chrome acceptance harness, P07 OKF concepts/ADR, README/UI evidence, and the migration rollback fix.
- Reviewed and updated the fingerprint-verified ERP mistakes log. Appended one P07 event to the local Notion queue; it remains pending and no Notion API was called.
- P08 baseline verified: current `erp_dev` is MariaDB 11.8.9, with migrations through `2026_11_21_000008_add_p07_sales_fulfillment`; organization product counts are 11 and 1, inventory operations are 10 opening / 5 issue / 1 transfer, and there are 9 sales orders.
- Implemented P08 request/approval/conversion/receipt APIs, models and forward migration, Persian workspace, independent local approver provisioning, idempotent P06 receipt integration, concurrency worker, feature/unit tests, OKF concepts/ADR, runbook, and UI evidence.
- Applied migration 000009 to existing `erp_dev` and verified the pre-existing P01–P07 product, stock-operation, and sales-order counts remained unchanged at migration time. The full guarded suite passed 61 tests / 694 assertions.
- Google Chrome verified the main 5.000-unit order as 3.000 + 2.000, exact order/receipt/movement links, same-key replay after closeout, reader/self-approval controls, two-connection contention, mobile geometry, visible focus, and forced bright fallback.
- Updated `D:\All projects\Mistakes\ERP\mistakes.md` after verifying its project fingerprint. Appended local queue event `erp-p08-purchase-request-to-receipt-20261122T051859Z-4e82c0a6-7d21-4b5e-9731-6b48be21a7dc` to `D:\All projects\notion\notion.md` as `PENDING`; readback confirmed the JSON record. No Notion API was called.
- Implemented the P09 manual accounting engine, organization/editor authorization, exact Rial boundary, API/UI, forward migrations, and OKF/README/handoff documentation. Migrations 000010–000011 applied to existing `erp_dev`; observed P01–P08 counts remained unchanged. P09 tables contain only the documented synthetic acceptance fixtures.
- P09 focused tests passed 11 / 122 and the full guarded suite passed 78 / 825. TypeScript, build, Pint, PHP/Node syntax, route registration, diff, and OKF frontmatter/link validation passed.
- Isolated Chrome accepted sale journal 1, purchase 2, collection 3, supplier payment 4, and reversal 5. Journal 1 replay after period closure returned 200; the latest two-connection posting contention returned 201/200 and persisted journal 11 once. Concurrent period closure returned 200 while the competing post returned 422 and left journal 12 as draft. Mobile had 375/375 px document/client width and 82.19 px dock clearance; bright fallback had zero active refraction; live Vite loaded `accounting.css` with zero runtime errors.

## Work in Progress

P09 local engine implementation and acceptance are complete. Worked examples and open business posting decisions are documented in ADR-008. The project mistakes log fingerprint matched this repository. Local queue events P07, P08, and `erp-p09-balanced-accounting-accepted-20261124T064903Z-1c29adde` are `PENDING`; no remote Notion sync was performed.

## Remaining Work

P09 engineering, acceptance checks, documentation, and the local queue append are complete. The P09 queue event remains PENDING; no remote sync was performed. Preserve all P08/P09 code and synthetic records.

## Exact Next Steps

1. Verify final Git/migration state, OKF validation, and the already-appended P09 queue event.
2. Do not stage, commit, push, change branches, or sync Notion unless explicitly requested.
3. Leave all P08/P09 changes unstaged and uncommitted, preserve the synthetic `erp_dev` fixtures, and leave local Laravel/Vite running for review.

## Files Created

- `app/Models/SalesOrderDelivery.php`
- `app/Services/Sales/SalesFulfillmentService.php`
- `database/migrations/2026_11_21_000008_add_p07_sales_fulfillment.php`
- `tests/Feature/P07SalesFulfillmentTest.php` and `scripts/Verify-P07Browser.mjs`
- P08: `app/Models/PurchaseRequest.php`, `PurchaseRequestLine.php`, `PurchaseOrder.php`, `PurchaseOrderLine.php`, `PurchaseReceipt.php`.
- P08: `app/Services/Purchasing/PurchaseMoneyCalculator.php`, `PurchasingService.php`, `app/Http/Controllers/Api/V1/PurchasingController.php`, and migration `2026_11_21_000009_create_p08_purchase_tables.php`.
- P08: `resources/js/api/purchases.ts`, `resources/js/screens/PurchasingScreen.tsx`, `resources/css/purchases.css`, and `tests/Feature/P08PurchasingTest.php`.
- P08: `tests/Unit/PurchaseMoneyCalculatorTest.php`, `scripts/Verify-P08Browser.mjs`, `scripts/Lock-P08PurchaseOrderForConcurrency.php`, and `app/Console/Commands/ProvisionP08Approver.php`.
- P08 OKF: `architecture/p08-purchasing.md`, `data/p08-purchasing.md`, `security/p08-purchasing.md`, and `decisions/adr-007-p08-purchase-approval-and-pricing.md`.
- P08 browser evidence: seven final screenshots linked from `docs/UI_DESIGN.md#p08-purchasing-evidence`; earlier acceptance runs also left duplicate P08 captures in `docs/screenshots/`.
- P09: migrations `2026_11_22_000010_create_p09_accounting_tables.php` and `2026_11_22_000011_add_p09_one_sided_line_amount_check.php`; six accounting models; `AccountingMoneyCalculator.php`, `AccountingService.php`, `AccountingController.php`; routes, React API/screen/CSS; `tests/Feature/P09AccountingTest.php`, `tests/Unit/AccountingMoneyCalculatorTest.php`, `scripts/Lock-P09BookForConcurrency.php`, and `scripts/Verify-P09Browser.mjs`.
- P09 browser evidence: five final screenshots from `2026-11-22T08-33-42-246Z` are linked from `docs/UI_DESIGN.md#p09-accounting-evidence`. Repeated acceptance retries also left earlier P09 captures under `docs/screenshots/`; preserve them.
- P09 OKF: architecture, data, security, and ADR-008 documents plus index links were added; the accounting rules and open source-posting decisions are recorded.
- P07 OKF architecture/data/security/ADR-006 documents.
- Five final P07 screenshots linked from `docs/UI_DESIGN.md#p07-sales-fulfillment-evidence`.

## Files Modified

- `AGENTS.md`, `HANDOFF.md`, `README.md`, `docs/UI_DESIGN.md`, `routes/api.php`, `routes/web.php`, `resources/js/app.tsx`, `resources/js/components/WorkspaceShell.tsx`, `resources/css/app.css`, and `app/Policies/OrganizationPolicy.php`.
- API controllers `SalesController.php`, `SalesOrderController.php`, and `StockController.php`.
- Models `InventoryMovement.php`, `InventoryOperation.php`, `SalesOrderLine.php`, and `StockReservation.php`.
- `app/Services/Stock/StockService.php`.
- `resources/css/products.css`, sales/stock API types, and sales/stock React screens.
- P09: `AGENTS.md`, `HANDOFF.md`, `README.md`, `docs/UI_DESIGN.md`, `app/Policies/OrganizationPolicy.php`, `routes/api.php`, `routes/web.php`, `resources/js/app.tsx`, and `resources/js/components/WorkspaceShell.tsx`.
- P09 OKF: root/architecture/data/security/decision indexes, P09 architecture/data/security concepts, ADR-008, and `docs/okf/log.md`.
- OKF root/indexes, P05/P06 architecture/data/security/ADR documents, P08 concepts/ADR-007, project overview, and maintenance log.

## Important Architecture and Design Decisions

- Keep reservation original quantity immutable; `outstanding = original - consumed - released`.
- Lock order: `sales_order_line → product → sorted warehouse/location → stock key → reservation`. P07 cancellation processes linked reservations by location ID then reservation ID.
- A reserved issue validates reservation outstanding and physical stock, not unreserved availability. Issue, movement, delivery trace, and consumption commit together.
- Delivery idempotency binds the key to order, line, reservation, and quantity. Cancellation is line-locked, idempotent, and creates no movement.
- P06 standalone release refuses line-linked reservations. P05 commercial snapshots are unchanged.
- P08 approval policy requires an authorized editor other than the requester. Request lines snapshot product/unit/quantity when drafted. Conversion creates at most one order per request and binds retry identity to supplier and source-line/price payload. Purchase prices are whole IRR per base unit; each line rounds half-up to whole IRR, and the order total sums rounded lines.
- Receipt lock order is purchase order → order line → product → warehouse/location → P06 stock key. Receipt rechecks remaining quantity and current base-unit compatibility after those locks, then commits the receipt link, inbound operation/movement, line counter, and order closeout atomically.
- P09 local accounting scope is manual-only until source recognition, account mappings, tax, costing, cash/bank settlement, and production closed-period reversal decisions are approved. The synthetic book uses exact whole IRR and an Asia/Tehran timezone. Posting and reversal use a book-first lock order; closure is one-way; reversals append swapped lines.
- P09 API routes are `GET /api/v1/accounting/options`, `GET /api/v1/accounting/journals`, `GET /api/v1/accounting/journals/{id}`, `POST /api/v1/accounting/books`, `POST /api/v1/accounting/books/{id}/accounts`, `POST /api/v1/accounting/books/{id}/periods`, `POST /api/v1/accounting/periods/{id}/close`, `POST /api/v1/accounting/journals`, `PUT /api/v1/accounting/journals/{id}`, and `POST /post` and `/reverse` actions on a journal. The internal P10 service action also requires callers to resolve source records in the active organization.

## Commands Executed

- P09 so far: verified `main` at `f876fc5ecbfe17fc5d5071ae303fb2a3087fd861`, with no staged changes and pre-existing P08 changes; reviewed the fingerprint-matching ERP mistakes log. Focused tests passed 11 / 122 and the full guarded suite passed 78 / 825. Final typecheck, build, Pint, PHP/Node syntax, route registration, and diff checks passed. MariaDB was already healthy; it was not started or restarted.
- `php artisan route:list --path=api/v1/accounting` — 11 routes registered.
- `php artisan migrate:status --database=mariadb` — migrations 000010/000011 pending before development migration.
- Read-only `erp_dev` baseline and after-migration checks: P01–P08 counts matched; P09 tables were absent before and present after.
- `php artisan migrate --database=mariadb --force` — applied 000010 and 000011 forward; named volume was retained.
- `php artisan test --filter=P09Accounting` — 11 tests / 122 assertions passed. `php artisan test --filter=AccountingMoneyCalculatorTest` — 6 tests / 9 assertions passed. Full serial `php artisan test` — 78 tests / 825 assertions passed.
- `npm run typecheck`, `npm run build`, P09 PHP syntax checks, final changed-file `vendor/bin/pint --test`, `git diff --check`, and Node syntax check passed.
- `node scripts/Verify-P09Browser.mjs` — Chrome returned exact fixture results, replay 200, posting race 200/201, period closure race 200/422, 375/375 CSS px width, 82.19 px mobile dock gap, visible keyboard focus cue, bright fallback with zero active refraction, Vite `accounting.css` loaded, and zero runtime errors. Five screenshots saved at 1280×900 and 390×844.
- CUA inspected the user's Chrome local ERP entry point at `/sign-in`; that browser profile was signed out. The isolated acceptance harness used the existing local synthetic P03 editor credential; no credential was entered into the user's Chrome tab.

- `docker compose up -d --wait db` — existing DB service reported healthy; volume retained.
- `C:\php8.5\php.exe artisan migrate --force` — applied 000008 to existing `erp_dev`.
- The live `/stock` page at `http://127.0.0.1:8000/stock` responded in Chrome during P08 baseline inspection. Do not infer Vite or Docker CLI state from that response.
- `php artisan route:list --path=api/v1/sales-orders` — read/write routes registered.
- `php artisan test --filter=P07SalesFulfillmentTest` — 5 tests / 101 assertions passed.
- `php artisan test` — final guarded serial run passed 55 tests / 565 assertions after rollback/reapply.
- `npm run typecheck`, `npm run build`, changed-file `vendor/bin/pint --test`, PHP syntax checks, `git diff --check`, and OKF validation passed.
- `node scripts/Verify-P07Browser.mjs` — Chrome screenshots, keyboard/fallback, and two-connection retry/contention checks passed.
- P07-only `artisan migrate:rollback` and `artisan migrate` on `--env=testing` with the 000008 migration path completed.
- P08 baseline reads: Git root/branch/HEAD/status, `erp_dev` schema and migration list via Laravel Boost, product/stock-operation/sales-order counts, and the live `/stock` page in Chrome. Migration was not applied during baseline review.
- `npm run typecheck`, `npm run build`, changed-file `vendor/bin/pint --test`, PHP syntax, Node syntax, and `git diff --check` passed for P08.
- `C:\php8.5\php.exe artisan test --filter=P08PurchasingTest` passed 4 tests / 123 assertions against the guarded test database after correcting two fixture expectations.
- `C:\php8.5\php.exe artisan test --filter=PurchaseMoneyCalculatorTest` passed 2 tests / 6 assertions.
- `C:\php8.5\php.exe artisan test` passed the full guarded serial suite: 61 tests / 694 assertions.
- `C:\php8.5\php.exe artisan migrate --database=mariadb --force` applied only migration 000009 to verified `erp_dev`; P08 tables were empty before browser acceptance, and pre-existing P01–P07 counts were unchanged.
- `C:\php8.5\php.exe artisan p08:provision-approver` created the synthetic editor membership in `legacy-local`; its generated credential is in the ignored private storage directory and was not printed.
- `C:\php8.5\php.exe artisan migrate:status --database=mariadb --env=testing` showed migrations through 000009 applied in guarded `erp_test` after the full suite.
- `node scripts/Verify-P08Browser.mjs` passed in isolated Chrome with 0 runtime errors. It saved 7 screenshots at 1280×900 and 390×844. The 5.000-unit order was received as 3.000 + 2.000; balance readback was 15.000/4.000/11.000 before the separate contention receipt. The final receipt replay returned IDs receipt 11 / operation 31 / movement 32; the independent race returned 409/201 with one receipt.
- Appended the P08 event to `D:\All projects\notion\notion.md` under an exclusive lock and verified readback; it remains `PENDING`. Appended two reusable lessons to fingerprint-verified `D:\All projects\Mistakes\ERP\mistakes.md`. No remote sync.

## Validation and Test Results

- P09 focused suite: 11 tests / 122 assertions passed, covering four manual journal fixtures, exact Toman conversion, source-event replay/conflict, period boundaries, closed-period replay, reversal uniqueness, foreign scope, atomic rollback, maximum signed amounts, and the line CHECK.
- Full guarded serial Laravel suite: 78 tests / 825 assertions passed against `erp_test` with migrations through 000011.
- `npm run typecheck`, `npm run build`, changed-file Pint, changed-file PHP syntax checks, `node --check scripts/Verify-P09Browser.mjs`, and `git diff --check` passed.
- P09 Chrome harness passed on the local `erp_dev` synthetic book: journal 1 sale, 2 purchase, 3 collection, 4 supplier payment, 5 reversal; final posting contention journal 9 returned 201/200 once; the period-close race returned close 200 / post 422 and left draft journal 10. Same-key replay after period closure returned HTTP 200 for journal 1.
- Chrome 1280×900 and 390×844: 375/375 CSS px document/client width, visible search focus-within cue, dock top y=770, last setup panel bottom y=687.81 (82.19 px gap), bright fallback with 8 glass surfaces and 0 active SVG refraction surfaces, live Vite client and `accounting.css` loaded, and 0 runtime errors. Five final screenshots are linked in `docs/UI_DESIGN.md#p09-accounting-evidence`.
- Browser book 1 (`P09-BR-MWRJ62AX`) uses accounts 1–5 and periods 1–3. Sale/purchase/collection/payment journals are IDs 1–4, reversal ID 5 links to sale ID 1. Four 1-IRR posting contention fixtures are journals 6–9; close/post race journal 10 remains draft after its period closed. The book currently has 10 journals, 20 lines, and 9 request-key records; these synthetic fixtures are preserved.
- P01–P08 table counts matched before/after P09 migration: organizations 2, products 16, parties 2, party roles 4, units 3, warehouses/locations 17/17, price lists/entries 3/11, leads/activities 12/5, quotes/lines 11/13, sales orders/lines 9/11, stock locks/operations/movements/reservations 15/32/33/14, deliveries 4, purchase requests/lines 8/8, purchase orders/lines 8/8, and receipts 12.

- Canonical physical/reserved/available snapshots: `10.000/0.000/10.000 → 10.000/3.000/7.000 → 8.000/1.000/7.000 → 8.000/0.000/8.000`.
- Main browser fixture: order 8, line 10, product 11, reservation 9, delivery 3, operation 14, outbound movement 15. Final line is ordered 3.000, delivered 2.000, cancelled 1.000, pending 0.000; total remains 300,000 toman.
- Two independent requests using the same delivery key/payload returned 201/200 and one delivery/operation. Changed payload returned 409; excess new delivery returned 422.
- Access and failure coverage includes reader 403, foreign/unrelated IDs 404, CSRF 419, controlled atomic failure, and normal standalone P06 release/issue.
- Chrome 1280×900 and 390×844: visible Tab focus, no mobile horizontal overflow (document/client widths both 375 CSS px), forced fallback with 3 glass surfaces and 0 SVG refraction surfaces, 0 browser runtime errors.
- OKF validation: 33 Markdown files, 27 frontmatter-bearing concept documents, and 171 valid internal file links; root OKF 0.2 only.
- P08 focused tests covered self-approval denial and approval actor/timestamp, one-to-one conversion and price snapshot conflicts, 5.000 as 3.000 + 2.000, multi-line closeout, idempotent replay, 15.000/4.000/11.000 balance readback, reader/foreign isolation, wrong location pairing, unit mismatch, atomic rollback, and normal P06 standalone receipt.
- Final OKF 0.2 checks found 33 Markdown files, 27 frontmatter-bearing concept documents, and 171 valid internal file links; only the root `index.md` declares `okf_version`.
- Chrome 1280×900/390×844: keyboard Tab reached request quantity and receipt submit with visible focus; invalid 6.000 receipt showed UI feedback and left the balance unchanged; mobile had zero horizontal overflow and 99.03 CSS px clearance from the final panel to dock. Bright fallback retained four glass surfaces and zero SVG-refraction surfaces.
- P08 final fixture: request 7, order 7, product 16, line 7. Receipts 10/11 received 3.000/2.000 and link to operations 30/31 and movements 31/32. The closed-order replay returned receipt 11 / operation 31 / movement 32. Contention order 8 / line 8 saved one 1.000 receipt 12 / operation 32 / movement 33 (the other request returned 409). Because the contention fixture used the same product/location, its separate receipt raised current physical/reserved/available to 16.000/4.000/12.000; the canonical 5.000 flow readback before that extra test was 15.000/4.000/11.000.

## Known Issues and Blockers

- P08 has no implementation blocker. The user's Chrome session was a reader in organization B; it rendered the P08 read-only list. The isolated Chrome harness used local synthetic editor and approver accounts for write acceptance.
- P09 is accepted for manual synthetic journals. Source-driven sales/purchase recognition, tax, inventory costing, cash/bank settlement, and production closed-period corrections remain unapproved and disabled as recorded in ADR-008.
- The user's Chrome profile remained signed out at `/sign-in` when inspected with Computer Use; the isolated Chrome acceptance harness used the existing ignored local P03 editor credential and verified the authenticated P09 workflow.
- One temporary profile from an early failed P08 browser startup remains under ignored `storage/framework/testing/p08-browser-PqwoMj` because Windows reported an `EBUSY` file lock. The final harness cleanup completed successfully; no profile cleanup was attempted outside the exact generated directory.
- The requested GPT-6 Luna/max execution profile was not exposed for verification.
- The prior handoff's `dc0c130` HEAD and unstaged P07 state did not match the actual clean `f876fc5` P07 commit at this task's start; the handoff was reconciled before P08 work.

## Risks and Assumptions

- Existing P07 fixtures remain in `erp_dev`. P08 acceptance added synthetic records that were preserved: 8 purchase requests, 8 orders, 12 receipts, and four products in the default organization. Product 16 has a main-order receipt increase of 5.000 and a separate 1.000 last-unit contention receipt at the same location; its current physical/reserved/available balance is 16.000/4.000/12.000.
- Results establish local development behavior only.
- P09 browser acceptance preserved its synthetic fixtures in `erp_dev`: book 1 (`P09-BR-MWRJ62AX`), five accounts, four periods, twelve journals, twenty-four lines, and ten idempotency request keys. Journals 6–9 and 11 are one-rial contention fixtures from repeated harness runs; journals 10 and 12 are drafts left by close/post races. Period 2 was closed in the UI after the final posting checks. Do not delete them as cleanup.

## Database or Migration State

- P09 migrations 000010 and 000011 were exercised by guarded `erp_test`. Both are applied in batch 8 to existing `erp_dev`. It contains one book, five accounts, four periods, twelve journals, twenty-four lines, and ten request-key rows from synthetic acceptance.

- `erp_dev`: MariaDB 11.8.9 has P08 migration `2026_11_21_000009_create_p08_purchase_tables` applied in batch 7 to the existing volume. At migration time, products were 11/1 by organization, inventory operations were 10 opening / 5 issue / 1 transfer, and sales orders were 9; those counts were unchanged by migration.
- `erp_test`: full guarded suite passed 78 tests / 825 assertions after migrations through 000011. Do not reset `erp_dev`; `Tests\TestCase` guards test database refreshes.

## Configuration and Environment Notes

- `.env`, `.env.testing`, and examples were not changed. PHP 8.5.13 is at `C:\php8.5\php.exe`; MariaDB uses loopback port 3307. The P08 approver credential is held only in ignored `storage/app/private/p08-approver-credentials.json` and was not printed.
- The normal command sandbox cannot reach the DB host port; database/Docker commands were run through the permitted elevated path.
- `npm run dev` was started for P09 acceptance after confirming ports 8000/5173 were free; it remains active for local review. MariaDB was already healthy on 3307 and was not restarted.

## Uncommitted or Partially Applied Changes

- P07 changes are committed in the starting `f876fc5` HEAD. All P08 and P09 source/docs/screenshots are unstaged/untracked; nothing is staged, committed, or pushed.
- P08 migration 000009 is fully applied in `erp_dev` and present in guarded `erp_test`; no migration is partial.
- P09 migrations 000010/000011 are fully applied in both local schemas; P01–P08 counts were unchanged across the development migration.
- Earlier P07 event `erp-p07-sales-order-fulfillment-20261121T172436Z-82e0d709-8890-4ab4-a65d-ed3df03b9d37` remains `PENDING` in `D:\All projects\notion\notion.md`.
- P08 event `erp-p08-purchase-request-to-receipt-20261122T051859Z-4e82c0a6-7d21-4b5e-9731-6b48be21a7dc` was appended as `PENDING` and verified by readback. No remote sync was done.

## Recovery or Rollback Notes

- Do not roll back `erp_dev`; it contains preserved P01–P07 data and synthetic P08 purchase/receipt fixtures.
- The verified P07-only test command is `artisan migrate:rollback --database=mariadb --path=database/migrations/2026_11_21_000008_add_p07_sales_fulfillment.php --env=testing --force`. It removes P07 fields/table, preserves P06 tables, and restores the P06 operation FK/support index. Reapply only against guarded `erp_test`.
- P08 migration 000009 is additive. No P08 rollback rehearsal was run; keep `erp_dev` at P08 and do not remove its accepted P08 synthetic receipt fixtures.
- P09 migrations are additive. Rolling back 000011 removes only the journal-line CHECK; rolling back 000010 drops the six P09 tables and all P09 books/accounts/periods/journals/lines/retry records. Do not roll them back in `erp_dev`; any rehearsal must target guarded `erp_test` only.
- Do not run `migrate:fresh`, reset the MariaDB volume, or delete generated evidence.

## Related Documentation

- [Project instructions](AGENTS.md), [README/runbook](README.md), [phase roadmap](docs/MASTER_PLAN.md), [OKF index](docs/okf/index.md), [P07 UI evidence](docs/UI_DESIGN.md#p07-sales-fulfillment-evidence), and [P08 UI evidence](docs/UI_DESIGN.md#p08-purchasing-evidence).
- [P07 workflow](docs/okf/architecture/p07-sales-fulfillment.md), [data](docs/okf/data/p07-sales-fulfillment.md), [security](docs/okf/security/p07-sales-fulfillment.md), and [ADR-006](docs/okf/decisions/adr-006-p07-reserved-sales-order-issues.md).
- [P08 workflow](docs/okf/architecture/p08-purchasing.md), [data](docs/okf/data/p08-purchasing.md), [security](docs/okf/security/p08-purchasing.md), and [ADR-007](docs/okf/decisions/adr-007-p08-purchase-approval-and-pricing.md).
- [P09 workflow](docs/okf/architecture/p09-accounting.md), [data](docs/okf/data/p09-accounting.md), [security](docs/okf/security/p09-accounting.md), [ADR-008](docs/okf/decisions/adr-008-p09-accounting-scope-and-posting-decisions.md), and [P09 UI evidence](docs/UI_DESIGN.md#p09-accounting-evidence).

## Notes for the Next Agent

P09 is accepted at its local manual/synthetic boundary. Preserve the existing P08 fixtures and P09 synthetic book/journals; do not enable automatic source posting until ADR-008 decisions are approved. The P09 user Chrome tab was signed out; the isolated Chrome harness completed the workflow and saved five final screenshots. The project mistakes log was reviewed and not changed. Append one P09 local queue event under the shared-file lock; never sync remotely without an explicit user command.
