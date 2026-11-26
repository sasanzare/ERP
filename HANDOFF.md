# Project Handoff

## Last Updated

2026-11-26

## Project Summary

Local-development-only ERP prototype using synthetic MariaDB data. P01–P11 are accepted at their local-development boundaries; P10 approval applies only to the local synthetic ERP MVP mapping in ADR-008. P11 is accepted for the local read-only dashboard and repeatable synthetic walkthrough. Live/production posting remains disabled. Production deployment, cloud, and external integrations remain out of scope.

## Current Objective

P11 acceptance is complete in the existing local repository. Preserve the existing P10 `synthetic_test` profile and prior `erp_dev` records. Do not stage, commit, push, or change branches.

## Current Phase or Milestone

P09 is accepted for manual and synthetic journals. P10 is ACCEPTED for the local ERP MVP only (user approval dated 2026-11-24); live/production posting remains disabled. P11 is ACCEPTED (2026-11-26). The full guarded suite passed 90 tests / 1,083 assertions; the focused P11 suite passed 5 / 122. At task start, Git was clean on `main` at `0c9261d271666b932a47b07416807e9221ddc8d1`, matching `origin/main`; the prior P10 handoff's worktree/HEAD details were stale. MariaDB 11.8.9 is healthy on 127.0.0.1:3307 with migrations through 000012 applied to `erp_dev`. Read-only inspection verified organization 1 / `legacy-local`, book 2 / `P10-SYNTH-BROWSER`, `Asia/Tehran`, the unchanged `synthetic_test` profile, and the six ADR-008 accounts (1010, 1020, 1100, 2100, 4100, 5100) as active/postable; approval metadata remains null. At task start there were four customer invoices totaling 4,000,000 IRR and two supplier invoices totaling 1,000,000 IRR in that book. The P11 walkthrough command ran twice on `erp_dev`; it added one sale order/delivery, one purchase request/order/receipt, one pending request, two invoices, two settlements, three P11 product movements, and four linked P09 journals. Existing P10 profile and prior manual journal records were not changed. Independent source-row and Chrome readbacks at organization 1 / book 2 / 2026-11-26 are 5,000,000 IRR net sales, 600,000 IRR overdue receivables, 131,500 EA available across 15 positive product/location rows, and 1 pending purchase approval. No P11 migration was added. The existing XAMPP MariaDB remains on port 3306 and must not be used or changed. Normal shell access to Docker and DB loopback requires escalation.

## Repository State

- Repository path: `D:\All projects\ERP`
- Current branch: `main`
- Base or starting commit: `0c9261d271666b932a47b07416807e9221ddc8d1`
- Current HEAD: `0c9261d271666b932a47b07416807e9221ddc8d1` (`feat(p10): implement local invoice and settlement workflow`)
- Working tree status: P11 implementation and this handoff update are uncommitted; branch `main` remains at the starting HEAD and matches `origin/main` (0 ahead/behind). Re-read with `git -c core.fsmonitor=false` after the normal status command reported an fsmonitor IPC error.
- Staged changes: none.
- Unstaged tracked files: `AGENTS.md`, `HANDOFF.md`, `README.md`, `docs/UI_DESIGN.md`, `docs/okf/architecture/current-architecture.md`, `docs/okf/architecture/index.md`, `docs/okf/data/index.md`, `docs/okf/data/p06-stock-balances.md`, `docs/okf/data/p10-settlement.md`, `docs/okf/decisions/adr-008-p09-accounting-scope-and-posting-decisions.md`, `docs/okf/index.md`, `docs/okf/log.md`, `docs/okf/project-overview.md`, `docs/okf/security/index.md`, `resources/js/app.tsx`, `resources/js/components/WorkspaceShell.tsx`, `routes/api.php`, and `routes/web.php`.
- Untracked P11 files: `app/Console/Commands/ProvisionP11Walkthrough.php`, `app/Http/Controllers/Api/V1/DashboardController.php`, `app/Services/Reporting/P11DashboardService.php`, `docs/okf/architecture/p11-dashboard.md`, `docs/okf/data/p11-reporting.md`, `docs/okf/security/p11-reporting.md`, six P11 screenshots under `docs/screenshots/`, `resources/css/dashboard.css`, `resources/js/api/dashboard.ts`, `resources/js/screens/DashboardScreen.tsx`, `scripts/Verify-P11Browser.mjs`, and `tests/Feature/P11DashboardTest.php`.

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
- At the start of this approval task, ADR-008 still lacked domain approval. The fingerprint-matching `D:\All projects\Mistakes\ERP\mistakes.md` was reviewed; no new reusable lesson was needed.
- Added P10 organization/book-scoped invoice, source-line, open-item, treasury, allocation, and posting-profile records; exact Rial calculation; synthetic-only profile resolver; P09 linked-journal posting; and standalone P10 reversal rejection.
- Added settlement routes, reader/editor checks, explicit CSRF protection, Persian RTL invoice/settlement screen, and a responsive solid-content layout using the existing Liquid Glass shell.
- Added `p10:provision-synthetic-profile`, guarded to local debug mode, to create an isolated `P10-SYNTH-*` book/account mapping.
- The initial P10 implementation baseline passed 7 focused tests / 120 assertions and a full suite of 85 / 945; the latest approval-task focused run passed 7 / 136. Coverage includes customer balance 1,000,000 → 600,000 rial / 60,000 toman, supplier balance 500,000 → 300,000 rial, stable replay after zero balance and period closure, exact account mapping, closed-period correction rejection, reader/foreign/CSRF denials, synthetic-only profile disclosure, exact rounding, and rollback.
- Chrome acceptance used P10-SYNTH-BROWSER book 2 with synthetic P07/P08 sources. Customer invoice 4 links order 9 / line 11 / delivery 4 and receipt movement 5; supplier invoice 6 links order 5 / line 5 / warehouse receipts 7/8 and payment movement 8. A two-server race returned 201/422 and left 200,000 rial outstanding. Desktop/mobile/fallback screenshots, keyboard focus, live Vite styling, and zero runtime errors are recorded in the P10 UI design section.
- On 2026-11-24 the user approved six P10 rules for the local ERP MVP only. ADR-008 now records organization 1 (`legacy-local`), book 2 (`P10-SYNTH-BROWSER`), the existing `synthetic_test` profile, all six account IDs/codes, and the exact local approval boundary. No profile was converted to `approved`.
- Extended `P10SettlementTest` to assert the exact customer/supplier invoice and receipt/payment account codes and debit/credit amounts, invoice/payment idempotent replay after closing the period, rejection of new closed-period posting, and 409 rejection of standalone reversal for both P10-linked journals. The guarded P10 suite passed 7 tests / 136 assertions.
- Read-only `erp_dev` checks confirmed the existing profile and all six mapped accounts remain active/postable. Existing sample balances remain customer invoices 1/4 at 600,000 IRR, 2/5 at 200,000 IRR, and supplier invoices 3/6 at 300,000 IRR. This task ran no mutating command against `erp_dev`; the test suite targeted guarded `erp_test`.
- Appended approval event `erp-p10-local-mvp-acceptance-20261124-65bf8ae5-d503-4d00-92be-6d1cc4288a5e` under the shared queue lock; readback verified one `PENDING` event with an empty `changes` array. No Notion API was called.
- Implemented the P11 read-only, organization-scoped reporting API and Persian RTL dashboard. Financial totals use the selected book; stock and approval counts remain organization-wide. Historical cutoffs use the selected book timezone and each metric opens its contributing source rows.
- Added the repeatable local P11 walkthrough command through accepted P05/P06/P07/P08/P10 workflows, with stable identities and no new migration or P10 profile changes.
- Added P11 feature coverage, isolated Chrome acceptance, six screenshots, and relevant OKF/README/UI documentation. Reviewed and updated the fingerprint-matched `D:\All projects\Mistakes\ERP\mistakes.md` with the reusable Chrome-profile watcher lesson.
- Appended event `erp-p11-local-mvp-acceptance-20261126-f12edeed-504f-41d5-bb7c-78966676ce3a` under the shared queue lock; readback confirmed one `PENDING` event with no database changes. No Notion API was called.

## Work in Progress

No implementation task is currently in progress. P11 acceptance, documentation, browser evidence, and local queue reporting are complete. Preserve the P10 synthetic profile, prior invoices, P08/P09 records, P11 synthetic fixture, and screenshots.

## Remaining Work

No P11 engineering or acceptance work remains. Queue events remain `PENDING` until explicitly synced by the user; live/production posting and coordinated corrections remain outside the approved local MVP.

## Exact Next Steps

1. Review the unstaged P11 diff and screenshots.
2. Leave staging, commit, push, and branch changes to the user; sync the local Notion queue only after an explicit request.

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
- P10: `database/migrations/2026_11_24_000012_create_p10_settlement_tables.php`, `app/Console/Commands/ProvisionP10SyntheticProfile.php`, P10 models/services/controller, `resources/js/api/settlements.ts`, `resources/js/screens/SettlementScreen.tsx`, `resources/css/settlements.css`, `tests/Feature/P10SettlementTest.php`, `tests/Unit/P10AmountCalculatorTest.php`, and `scripts/Verify-P10Browser.mjs`.
- P10 OKF: `architecture/p10-settlement.md`, `data/p10-settlement.md`, `security/p10-settlement.md`, updated architecture/data/security/decision indexes, updated ADR-008, and `docs/okf/log.md`.
- P10 browser evidence: 25 generated screenshots are preserved under `docs/screenshots/`; the five final screenshots are linked from `docs/UI_DESIGN.md#p10-customer-and-supplier-settlement-evidence`. The acceptance data remains in `P10-SYNTH-BROWSER`.
- P11: `app/Http/Controllers/Api/V1/DashboardController.php`, `app/Services/Reporting/P11DashboardService.php`, `app/Console/Commands/ProvisionP11Walkthrough.php`, `resources/js/api/dashboard.ts`, `resources/js/screens/DashboardScreen.tsx`, `resources/css/dashboard.css`, `tests/Feature/P11DashboardTest.php`, and `scripts/Verify-P11Browser.mjs`.
- P11 OKF: `architecture/p11-dashboard.md`, `data/p11-reporting.md`, and `security/p11-reporting.md`; updated relevant indexes, P06/P10 data concepts, ADR-008, project overview, and current architecture.
- P11 Chrome evidence: six screenshots linked from `docs/UI_DESIGN.md#p11-reconciled-dashboard-evidence`.
- P07 OKF architecture/data/security/ADR-006 documents.
- Five final P07 screenshots linked from `docs/UI_DESIGN.md#p07-sales-fulfillment-evidence`.

## Files Modified

- `AGENTS.md`, `HANDOFF.md`, `README.md`, `docs/UI_DESIGN.md`, `routes/api.php`, `routes/web.php`, `resources/js/app.tsx`, `resources/js/components/WorkspaceShell.tsx`, `resources/css/app.css`, and `app/Policies/OrganizationPolicy.php`.
- API controllers `SalesController.php`, `SalesOrderController.php`, and `StockController.php`.
- Models `InventoryMovement.php`, `InventoryOperation.php`, `SalesOrderLine.php`, and `StockReservation.php`.
- `app/Services/Stock/StockService.php`.
- `resources/css/products.css`, sales/stock API types, and sales/stock React screens.
- P09: `AGENTS.md`, `HANDOFF.md`, `README.md`, `docs/UI_DESIGN.md`, `app/Policies/OrganizationPolicy.php`, `routes/api.php`, `routes/web.php`, `resources/js/app.tsx`, and `resources/js/components/WorkspaceShell.tsx`.
- P10: `AGENTS.md`, `HANDOFF.md`, `README.md`, `docs/UI_DESIGN.md`, OKF root/architecture/data/security/decision indexes, P10 concepts, ADR-008, `docs/okf/log.md`, `app/Services/Accounting/AccountingService.php`, routes, React app, and workspace shell.
- P10: `app/Services/Accounting/AccountingService.php` rejects standalone reversal of `p10.*` journals; `routes/api.php`, `routes/web.php`, `resources/js/app.tsx`, and `resources/js/components/WorkspaceShell.tsx` register the settlement UI/API.
- P10 approval task: updated `AGENTS.md`, `README.md`, ADR-008, P10 OKF architecture/data/security concepts, current architecture/project overview/indexes/log, and `HANDOFF.md`; extended `tests/Feature/P10SettlementTest.php` with exact posting-account and closed-period correction assertions.
- P11: updated `AGENTS.md`, `HANDOFF.md`, `README.md`, `docs/UI_DESIGN.md`, `routes/api.php`, `routes/web.php`, `resources/js/app.tsx`, `resources/js/components/WorkspaceShell.tsx`, and related OKF concepts/indexes/log.
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
- P10 lock order is book → source order → sorted order lines/source events → open item → treasury movement, followed by the existing P09 book → journal → period → sorted accounts path. P10 journals use `p10.*` source types and cannot be reversed through the standalone P09 route. Customer amounts derive from delivered P05 snapshots in exact whole Toman then convert ×10 to Rial; supplier amounts derive from received P08 quantities and whole-Rial unit-price snapshots with cumulative rounding. These rules are approved only for the exact local synthetic mapping in ADR-008; live/production use remains disabled.
- P11 reads only the active organization. Net sales and overdue receivables are scoped to the selected book; stock availability and pending purchase approvals cover that organization. Financial cutoffs use the selected book's timezone. Drill-downs use the same source predicates as tile totals, with no P11 ledger posting or schema migration.

## Commands Executed

### P10 task

- `git -c core.fsmonitor=false status --porcelain=v2 --branch`, `git rev-parse HEAD`, and `git log -6 --oneline` — confirmed `main` at `09611dc65f29ccb7e1c4285884b8f8b487aef70d` before P10 changes.
- `docker compose ps` initially failed because the regular shell could not access Docker Desktop's named pipe. The authorized elevated `docker compose up -d --wait db` then reported `erp-local-db-1` healthy; no volume reset was run.
- `php artisan migrate:status --database=mariadb` and `--env=testing` — initially confirmed P10 migration 000012 pending in `erp_dev` and applied in `erp_test`; later status checks confirmed it Ran in both schemas.
- `php artisan route:list --path=settlements --except-vendor` — 7 settlement routes registered.
- `docker compose up -d --wait db` through the authorized elevated path — service `erp-local-db-1` reported healthy; volume retained.
- `php artisan migrate --database=mariadb --force` — applied only P10 migration 000012 to existing `erp_dev` after reading exact P01–P09 counts; post-migration counts matched and all new P10 tables were empty.
- `p10:provision-synthetic-profile 1 P10-SYNTH-BROWSER` — created separate book 2, period 5, six accounts, and a `synthetic_test` profile in `erp_dev`; no live approval metadata was set.
- The initial P10 implementation run passed focused `php artisan test --filter=P10` at 7 tests / 120 assertions and full `php artisan test` at 85 tests / 945 assertions. Both were serial. The approval task reran the focused suite at 7 / 136; the full suite was not rerun after that test-only update.
- P10 browser acceptance via `node scripts/Verify-P10Browser.mjs` passed. Customer invoice 4 (order 9/line 11/delivery 4) posted 1,000,000 IRR; receipt movement 5/journal 21 allocated 400,000, leaving 600,000 IRR / 60,000 Toman. Supplier invoice 6 (order 5/line 5/receipts 7 and 8) posted 500,000 IRR; payment movement 8/journal 26 allocated 200,000, leaving 300,000 IRR. Contention invoice 5 returned 201/422 for two 400,000-IRR allocations, with 800,000 allocated and 200,000 outstanding.
- Chrome at 1280×900 and 390×844: mobile widths 375/375 CSS px, content-to-dock gaps 81.75/81.72 px, visible keyboard focus, bright fallback with 9 surfaces/0 active refraction, live Vite client plus `settlements.css`, and 0 runtime errors. Five final screenshots are linked from `docs/UI_DESIGN.md#p10-customer-and-supplier-settlement-evidence`.
- OKF validation via Symfony YAML parser and internal-link scan passed: 40 Markdown files, 35 frontmatter documents, 223 valid internal links, and root-only OKF 0.2 metadata.
- Changed-file PHP syntax, Pint, `npm run typecheck`, `npm run build`, `node --check scripts/Verify-P10Browser.mjs`, route registration, and `git diff --check` passed.
- The approval-task `C:\php8.5\php.exe artisan test --filter=P10` run passed 7 tests / 136 assertions on guarded `erp_test`. A normal sandbox invocation was denied local MariaDB socket access before tests began; the serial guarded run then used the permitted access path. An earlier account-mapping test attempt was corrected to fetch full journal details before the passing run.
- `C:\php8.5\php.exe vendor\bin\pint --test tests\Feature\P10SettlementTest.php` and `C:\php8.5\php.exe -l tests\Feature\P10SettlementTest.php` passed after the final test-file edit.
- Read-only Laravel Boost `SELECT` queries verified the organization/book/profile/account mapping and current existing invoice balances in `erp_dev`. No `erp_dev` mutation was run in this task.
- Final Git status remained on `main` at the starting HEAD (0 commits ahead/behind): 18 tracked files modified and 46 untracked P10 files/evidence; none staged. `git -c core.fsmonitor=false diff --check` exited 0 with only CRLF-normalization warnings.

- P09 historical context: HEAD `09611dc` now includes the accepted P08/P09 baseline. P09 focused tests passed 11 / 122 and the original full guarded suite passed 78 / 825. The P10 task separately reviewed the fingerprint-matching ERP mistakes log.
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

### P11 task

- Read-only baseline: `git -c core.fsmonitor=false status`, `docker compose ps`, `php artisan migrate:status --database=mariadb`, and scoped `tinker` reads confirmed the clean starting HEAD, healthy MariaDB, migrations through 000012, and the existing `legacy-local` / `P10-SYNTH-BROWSER` / `synthetic_test` mapping. No `erp_dev` P11 fixture existed before provisioning.
- `php artisan p11:provision-walkthrough` — ran twice on `erp_dev`; both runs returned the same sale order `SO-01M8BT9RD7STH5SX8TR2G1B0Q3`, customer/supplier invoices 7/8, purchase order 9 / receipt 13, and treasury movements 9/10. Local readback showed 1,000,000 IRR billed / 400,000 collected / 600,000 open; 500,000 IRR billed / 200,000 paid / 300,000 open; 10.000 EA available for the P11 product. The P10 profile/manual journals and migrations were not changed.
- Independent source-row query at `legacy-local` / `P10-SYNTH-BROWSER` / `2026-11-26` returned 5,000,000 IRR net sales, 600,000 IRR overdue receivables, 131.500 EA available across 15 positive product/location rows, and 1 pending request.
- `npm run dev` — started Laravel at 127.0.0.1:8000 and Vite at 127.0.0.1:5173 after checking both ports free; stopped after browser acceptance. The final browser harness used OS temp for its Chrome profile to avoid Laravel watcher `EBUSY` in `storage/framework/testing`; no P11 temp profile directories remain in the repository.
- `node scripts/Verify-P11Browser.mjs` — passed on Chrome with expected/observed totals equal, all-page details 5/1/15/1, due/future-receipt boundaries 0/1,000,000/600,000, second-book sales 0, Toman 500,000/60,000, both linked business journeys, loading/error/empty UI, keyboard focus, 375/375 CSS-px mobile width, 82.08-px dock gap, bright fallback with 3 glass surfaces/0 refraction, Vite client and `dashboard.css`, and 0 runtime errors. Saved six screenshots in `docs/screenshots/`.
- `php artisan test --filter=P11DashboardTest` — 5 tests / 122 assertions passed. Full serial `php artisan test` — 90 tests / 1,083 assertions passed on guarded `erp_test`.
- `npm run typecheck`, `npm run build`, changed-file Pint, `node --check scripts/Verify-P11Browser.mjs`, `git diff --check`, and Symfony YAML/internal-link validation passed. OKF validation: 43 Markdown files, 37 typed concepts, root-only OKF 0.2, 250 valid internal file links.

## Validation and Test Results

### P11 task

- Focused `php artisan test --filter=P11DashboardTest`: 5 tests / 122 assertions passed. Full serial `php artisan test`: 90 tests / 1,083 assertions passed against guarded `erp_test`.
- `npm run typecheck`, `npm run build`, changed-file Pint, `node --check scripts/Verify-P11Browser.mjs`, and `git diff --check` passed. No P11 schema migration was required.
- Symfony YAML and internal-link validation passed for OKF 0.2: 43 Markdown files, 37 concept documents with required `type`, root-only version metadata, and 250 valid internal links.
- P11 Chrome harness expected/observed totals matched for organization 1 / book 2 / 2026-11-26: net sales 5,000,000 IRR, overdue 600,000 IRR, available stock 131.500 EA across 15 rows, and one pending approval. The detail lists contained 5 / 1 / 15 / 1 source rows.
- Historical checks returned overdue 0 on the invoice due date 2026-11-24, 1,000,000 IRR on 2026-11-25 before the 2026-11-26 receipt, and 600,000 IRR afterward. A second same-organization book returned zero sales. Toman values were 500,000 and 60,000.
- Chrome verified confirmed sales order/delivery, independent purchase approval/order/receipt, and both invoice/settlement cards; each P11 seed replay returned the same source IDs and balances. At 390×844, document/client widths were 375/375 CSS px and the report cleared the dock by 82.08 px. Keyboard focus was visible; bright fallback retained three glass surfaces and zero active refraction; Vite `dashboard.css` loaded; runtime errors: 0.
- The user's existing Chrome profile was signed out at the local app. The isolated Chrome harness used the local P03 fixture, and no credentials were entered into the user's profile. Screenshots are linked from `docs/UI_DESIGN.md#p11-reconciled-dashboard-evidence`.

### P10 task

- PHP syntax checks passed for the P10 migration, models/services/controller, routes, and `AccountingService.php`.
- `php artisan route:list --path=settlements --except-vendor` listed 7 routes.
- The latest focused guarded P10 suite passed: 7 tests / 136 assertions. It covers both customer/supplier invoice and settlement journeys, exact account-code debit/credit lines and balances, idempotent invoice/payment replay after period closure, rejection of new closed-period posting, reversal rejection for P10 invoice and settlement journals, foreign/reader/CSRF behavior, synthetic profile disclosure, rounding, and rollback.
- The previous full guarded suite passed 85 tests / 945 assertions before this task added P10 acceptance assertions; the full suite was not rerun. In this task, `Pint --test` and PHP syntax passed for `P10SettlementTest.php`.
- OKF validation passed: 40 Markdown files, 35 frontmatter-bearing documents, 223 valid internal links, and root-only OKF 0.2 metadata.
- Appended one P10 event under the exclusive lock to `D:\All projects\notion\notion.md`; independent readback validated its JSON, `PENDING` state, and empty `changes` array. No Notion API was called.
- Prior P10 Chrome acceptance verified: customer order 9 / line 11 / delivery 4 invoice 4 / journal 20 = 1,000,000 IRR; receipt movement 5 / allocation 5 / journal 21 = 400,000 IRR; residual 600,000 IRR / 60,000 Toman. Supplier order 5 / line 5 / receipts 7,8 invoice 6 / journal 25 = 500,000 IRR; payment movement 8 / allocation 8 / journal 26 = 200,000 IRR; residual 300,000 IRR. All linked journals balance.
- Separate-connection contention on invoice 5 / order 8 returned one 201 and one 422; movement 6 and movement 7 allocated 800,000 IRR total, leaving 200,000 IRR. A changed-key replay/over-allocation rejection and zero-balance/closed-period replay were covered by focused feature tests.
- At 390×844, document/client widths were 375/375 CSS px. Customer and supplier content bottoms y=688.25/688.28 cleared the fixed dock at y=770 by 81.75/81.72 px. Tab focus was visible. Bright fallback had 9 shared glass surfaces and 0 active SVG refraction; the live route loaded Vite and `settlements.css`; Chrome reported 0 runtime errors. See saved screenshots in `docs/UI_DESIGN.md#p10-customer-and-supplier-settlement-evidence`.
- Read-only `erp_dev` verification showed organization 1 (`legacy-local`), book 2 (`P10-SYNTH-BROWSER`), and its original `synthetic_test` profile still present. Accounts 6–11 retain codes 1100/4100/2100/5100/1010/1020 and are active/postable. Existing invoices remain: customer IDs 1/4 at 600,000 IRR, 2/5 at 200,000 IRR; supplier IDs 3/6 at 300,000 IRR.
- P10 is **ACCEPTED for the local ERP MVP only**. Live/production source posting and a coordinated correction route remain disabled/out of scope. P11's later acceptance is recorded in the current milestone and P11 sections below.

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

- The six P10 workflow rules and exact organization 1 / book 2 / account mapping are approved for the local ERP MVP only and recorded in ADR-008. Production/live mappings, tax and costing treatment, treasury policy, and a coordinated correction workflow remain outside scope; do not activate a live profile from this local approval.
- P10 local acceptance passed, with no remaining local engineering blocker. The boundary is explicit: new postings into a closed period are rejected, exact retries return existing records, and P10 journals cannot be independently reversed. P11 is ACCEPTED at its local read-only dashboard/walkthrough boundary; live/source posting remains disabled.
- An early test attempt overlapped because a wrapper did not capture/poll a session. The corrected focused and full suites both passed serially; preserve the existing one-test-process rule for future suites.

- P08 has no implementation blocker. The user's Chrome session was a reader in organization B; it rendered the P08 read-only list. The isolated Chrome harness used local synthetic editor and approver accounts for write acceptance.
- P09 is accepted for manual synthetic journals. Source-driven sales/purchase recognition, tax, inventory costing, cash/bank settlement, and production closed-period corrections remain unapproved and disabled as recorded in ADR-008.
- The user's Chrome profile remained signed out at `/sign-in` when inspected with Computer Use; the isolated Chrome acceptance harness used the existing ignored local P03 editor credential and verified the authenticated P09 workflow.
- Resolved during P11 acceptance: initial browser harness runs stored Chrome profiles in `storage/framework/testing`, and Laravel Boost emitted `EBUSY` watcher warnings while Chrome wrote cache files. The P11 harness now uses a task-prefixed OS temp directory; the seven earlier P11 profile directories were checked for holders and removed by verified exact-path cleanup. No P11 browser profile remains in repository storage.
- One temporary profile from an early failed P08 browser startup remains under ignored `storage/framework/testing/p08-browser-PqwoMj` because Windows reported an `EBUSY` file lock. The final harness cleanup completed successfully; no profile cleanup was attempted outside the exact generated directory.
- The requested GPT-6 Luna/max execution profile was not exposed for verification.
- The prior handoff's `dc0c130` HEAD and unstaged P07 state did not match the actual clean `f876fc5` P07 commit at this task's start; the handoff was reconciled before P08 work.

## Risks and Assumptions

- Existing P07 fixtures remain in `erp_dev`. P08 acceptance added synthetic records that were preserved: 8 purchase requests, 8 orders, 12 receipts, and four products in the default organization. Product 16 has a main-order receipt increase of 5.000 and a separate 1.000 last-unit contention receipt at the same location; its current physical/reserved/available balance is 16.000/4.000/12.000.
- Results establish local development behavior only.
- P09 browser acceptance preserved its synthetic fixtures in `erp_dev`: book 1 (`P09-BR-MWRJ62AX`), five accounts, four periods, twelve journals, twenty-four lines, and ten idempotency request keys. Journals 6–9 and 11 are one-rial contention fixtures from repeated harness runs; journals 10 and 12 are drafts left by close/post races. Period 2 was closed in the UI after the final posting checks. Do not delete them as cleanup.

## Database or Migration State

- P10 migration `2026_11_24_000012_create_p10_settlement_tables` is applied as batch 9 in `erp_dev` and `erp_test` reports it `Ran` through the guarded suite.
- Before/after `erp_dev` counts matched for all observed P01–P09 tables: organizations 2, products 16, parties/roles 2/4, units 3, warehouses/locations 17/17, price lists/entries 3/11, leads/activities 12/5, quotes/lines 11/13, sales orders/lines 9/11, stock locks/operations/movements/reservations 15/32/33/14, deliveries 4, purchase requests/lines 8/8, purchase orders/lines 8/8, receipts 12, accounting books/accounts/periods/journals/lines/request keys 1/5/4/12/24/10. The volume was not reset.
- Synthetic Chrome acceptance added `P10-SYNTH-BROWSER` book 2, period 5, one `synthetic_test` profile, and six accounts. It now contains six invoices, eight invoice lines, six open items, eight treasury movements, and eight allocations. P10 journals are 13–26 in book 2. Customer invoices 1–5 and supplier invoices 3 and 6 are retained synthetic acceptance records; do not clean them up. P09 manual book 1 and journals 1–12 remain separate and unchanged.
- `erp_test` may be rebuilt only through the verified guarded Laravel test workflow; do not target `erp_dev` with `RefreshDatabase`.
- Docker Compose `db` service is running and reported healthy. The named volume was not reset.

- P11 adds no migration. The local command created synthetic product 17 / location 18, sale order 10 / delivery 5, purchase request 9 / order 9 / receipt 13, P10 customer/supplier invoices 7/8, treasury movements 9/10, and linked P09 journals 27–30. It also left request 10 submitted for approval. The dedicated P11 product/location is 10.000 EA physical, 0.000 reserved, and 10.000 available after the sale issue and purchase receipt. The command replay returned the same IDs without increasing these counts.
- The local P10 profile remains organization 1 / book 2 / `synthetic_test` with the ADR-008 mapping and null approval metadata. P09 manual book 1 / journals 1–12 are preserved. No P11 schema migration was applied.
- The full guarded `erp_test` suite passed 90 tests / 1,083 assertions after migrations through 000012; its RefreshDatabase operations never targeted `erp_dev`.

- P09 migrations 000010 and 000011 were exercised by guarded `erp_test`. Both are applied in batch 8 to existing `erp_dev`. It contains one book, five accounts, four periods, twelve journals, twenty-four lines, and ten request-key rows from synthetic acceptance.

- `erp_dev`: MariaDB 11.8.9 has P08 migration `2026_11_21_000009_create_p08_purchase_tables` applied in batch 7 to the existing volume. At migration time, products were 11/1 by organization, inventory operations were 10 opening / 5 issue / 1 transfer, and sales orders were 9; those counts were unchanged by migration.
- `erp_test`: full guarded suite passed 78 tests / 825 assertions after migrations through 000011. Do not reset `erp_dev`; `Tests\TestCase` guards test database refreshes.

## Configuration and Environment Notes

- `erp_dev` P09 migration state and P01–P09 row counts were read before migration 000012 was applied. `.env` and `.env.testing` were not changed; the test guard targets `erp_test`.
- P10 invoice/settlement writes are internally replayable and transaction-bound. Its profile remains `synthetic_test` with the exact six local accounts in ADR-008; the user approval did not create or enable a live `approved` profile.

- `.env`, `.env.testing`, and examples were not changed. PHP 8.5.13 is at `C:\php8.5\php.exe`; MariaDB uses loopback port 3307. P03/P08 synthetic credentials remain only in ignored private storage and were not printed.
- The normal command sandbox cannot reach the DB host port; database/Docker commands were run through the permitted elevated path.
- During Chrome acceptance, `npm run dev` served the app on ports 8000/5173 and was stopped after the final run; the ports were free afterward. The final P11 harness uses OS temp for isolated Chrome profiles so Laravel's watcher does not scan Chrome cache files. Seven earlier `p11-browser-*` directories under ignored `storage/framework/testing` were confirmed unheld and removed by exact-path cleanup; none remain.

## Uncommitted or Partially Applied Changes

- All P11 code, documentation, and screenshot changes are unstaged on `main` at starting HEAD `0c9261d271666b932a47b07416807e9221ddc8d1`. No files are staged, committed, pushed, or on a new branch.
- P10 migration 000012 is applied in both `erp_test` and `erp_dev`. The `P10-SYNTH-BROWSER` book, invoices, treasury movements, allocations, linked journals, and screenshots are intentional synthetic acceptance data retained for review.
- The starting HEAD contains the accepted P07/P08/P09/P10 baseline. P11 made no migration and no change to P10 profile configuration.
- The earlier overlapping P10 test attempt was superseded by successful serial focused/full runs. P10 acceptance rows and the synthetic profile are intentionally retained only in `P10-SYNTH-BROWSER` in `erp_dev`.
- Earlier P07 event `erp-p07-sales-order-fulfillment-20261121T172436Z-82e0d709-8890-4ab4-a65d-ed3df03b9d37` remains `PENDING` in `D:\All projects\notion\notion.md`.
- P08 event `erp-p08-purchase-request-to-receipt-20261122T051859Z-4e82c0a6-7d21-4b5e-9731-6b48be21a7dc` was appended as `PENDING` and verified by readback. No remote sync was done.
- P10 events `erp-p10-customer-supplier-settlement-20261124-1e0754c4-488d-41e7-a858-5998c508ac84` and `erp-p10-local-mvp-acceptance-20261124-65bf8ae5-d503-4d00-92be-6d1cc4288a5e`, and P11 event `erp-p11-local-mvp-acceptance-20261126-f12edeed-504f-41d5-bb7c-78966676ce3a`, are in the shared queue with `PENDING` state. No Notion API was called.

## Recovery or Rollback Notes

- Do not roll back `erp_dev`; it contains preserved P01–P07 data and synthetic P08 purchase/receipt fixtures.
- The verified P07-only test command is `artisan migrate:rollback --database=mariadb --path=database/migrations/2026_11_21_000008_add_p07_sales_fulfillment.php --env=testing --force`. It removes P07 fields/table, preserves P06 tables, and restores the P06 operation FK/support index. Reapply only against guarded `erp_test`.
- P08 migration 000009 is additive. No P08 rollback rehearsal was run; keep `erp_dev` at P08 and do not remove its accepted P08 synthetic receipt fixtures.
- P09 migrations are additive. Rolling back 000011 removes only the journal-line CHECK; rolling back 000010 drops the six P09 tables and all P09 books/accounts/periods/journals/lines/retry records. Do not roll them back in `erp_dev`; any rehearsal must target guarded `erp_test` only.
- P10 migration 000012 adds P10 tables and two source-trace unique indexes. It is applied in `erp_test` and `erp_dev`; do not roll it back from `erp_dev`. Any P10 rollback rehearsal must be separately authorized and target guarded `erp_test` only.
- P11 creates only stable synthetic business records through accepted local workflows. It has no schema rollback; do not delete the accepted walkthrough fixture or reset `erp_dev`.
- Do not run `migrate:fresh`, reset the MariaDB volume, or delete generated evidence.

## Related Documentation

- [Project instructions](AGENTS.md), [README/runbook](README.md), [phase roadmap](docs/MASTER_PLAN.md), [OKF index](docs/okf/index.md), [P10 UI evidence](docs/UI_DESIGN.md#p10-customer-and-supplier-settlement-evidence), and [P11 UI evidence](docs/UI_DESIGN.md#p11-reconciled-dashboard-evidence).
- [P07 workflow](docs/okf/architecture/p07-sales-fulfillment.md), [data](docs/okf/data/p07-sales-fulfillment.md), [security](docs/okf/security/p07-sales-fulfillment.md), and [ADR-006](docs/okf/decisions/adr-006-p07-reserved-sales-order-issues.md).
- [P08 workflow](docs/okf/architecture/p08-purchasing.md), [data](docs/okf/data/p08-purchasing.md), [security](docs/okf/security/p08-purchasing.md), and [ADR-007](docs/okf/decisions/adr-007-p08-purchase-approval-and-pricing.md).
- [P09 workflow](docs/okf/architecture/p09-accounting.md), [data](docs/okf/data/p09-accounting.md), [security](docs/okf/security/p09-accounting.md), [ADR-008](docs/okf/decisions/adr-008-p09-accounting-scope-and-posting-decisions.md), and [P09 UI evidence](docs/UI_DESIGN.md#p09-accounting-evidence).
- [P10 workflow](docs/okf/architecture/p10-settlement.md), [data](docs/okf/data/p10-settlement.md), [security](docs/okf/security/p10-settlement.md), [ADR-008 live-rule decisions](docs/okf/decisions/adr-008-p09-accounting-scope-and-posting-decisions.md), and [P10 UI evidence](docs/UI_DESIGN.md#p10-customer-and-supplier-settlement-evidence).
- [P11 workflow](docs/okf/architecture/p11-dashboard.md), [reporting data](docs/okf/data/p11-reporting.md), [security](docs/okf/security/p11-reporting.md), and [P11 UI evidence](docs/UI_DESIGN.md#p11-reconciled-dashboard-evidence).

## Notes for the Next Agent

P09 remains accepted at its local manual/synthetic boundary. P10 is ACCEPTED for the local ERP MVP only; P11 is ACCEPTED for local read-only reporting and synthetic walkthroughs only. Preserve P08 fixtures, P09 manual journals, P10 synthetic book 2/profile and prior settlements, the new P11 product/workflow fixtures, and screenshots. No P11 migration was added. Live/production posting remains disabled. Read [ADR-008](docs/okf/decisions/adr-008-p09-accounting-scope-and-posting-decisions.md) before changing posting gates. Run only one guarded Laravel test process at a time; capture and poll its session to completion. The fingerprint-verified ERP mistakes log now records the temp-profile watcher correction. Local queue events `erp-p10-customer-supplier-settlement-20261124-1e0754c4-488d-41e7-a858-5998c508ac84`, `erp-p10-local-mvp-acceptance-20261124-65bf8ae5-d503-4d00-92be-6d1cc4288a5e`, and `erp-p11-local-mvp-acceptance-20261126-f12edeed-504f-41d5-bb7c-78966676ce3a` remain `PENDING`; do not sync unless the user explicitly requests it. No Notion API was called.
