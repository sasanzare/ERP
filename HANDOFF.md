# Project Handoff

## Last Updated

2026-11-27

## Project Summary

Local-development-only ERP prototype using synthetic MariaDB data. P01–P13 are accepted at their local-development boundaries; P10 approval applies only to the local synthetic ERP MVP mapping in ADR-008. P12 adds organization-scoped project work and P13 adds separately provisioned membership-role administration/audit plus create-only party CSV/XLSX exchange and filtered CSV export. Live/production posting remains disabled. Production deployment, cloud, and external integrations remain out of scope.

## Current Objective

P13 is accepted at its local-development boundary. Preserve existing development records, P13 synthetic acceptance records, and the MariaDB volume; keep P10 live/production posting disabled. Do not stage, commit, push, or change branches. Sync Notion only after an explicit request; the current sandbox cannot write the shared queue path.

## Current Phase or Milestone

P09 remains accepted for manual and synthetic journals. P10 is ACCEPTED for the local ERP MVP only (user approval dated 2026-11-24); live/production posting remains disabled. P11 and P12 remain ACCEPTED at their local boundaries. P13 is ACCEPTED (2026-11-27). It started from clean `main` at `18b0103a1fcdc8fbab8dca37b1d1c3c6f13695c6` (`feat(p12): add projects and assigned work`), matching `origin/main`. Migration 000014 is applied in batch 11 to `erp_dev`; pre-migration counts for organizations, memberships, audits, parties/roles, products, P08 orders, P10 invoices, P09 journals, and P12 projects matched after the additive migration. The final local acceptance records include one role-manager grant, three P13 member role changes with one user audit each, seven completed import requests, and 29 P13-coded party records. Preserve them. Do not use or change XAMPP MariaDB on port 3306.

## Repository State

- Repository path: `D:\All projects\ERP`
- Current branch: `main`
- Base or starting commit: `18b0103a1fcdc8fbab8dca37b1d1c3c6f13695c6`
- Current HEAD: `18b0103a1fcdc8fbab8dca37b1d1c3c6f13695c6` (`feat(p12): add projects and assigned work`)
- Working tree status: 24 tracked paths modified and 69 untracked P13/source/evidence paths; all remain unstaged on `main`, which still matches `origin/main`. Read with `git -c core.fsmonitor=false status --short --branch`.
- Staged changes: none.
- Unstaged tracked files: `AGENTS.md`, `HANDOFF.md`, `README.md`, `app/Http/Controllers/Api/V1/PartyController.php`, `WorkspaceController.php`, `app/Policies/OrganizationPolicy.php`, `app/Services/MembershipRoleService.php`, `composer.json`, `composer.lock`, `docs/UI_DESIGN.md`, the P13-touched OKF architecture/data/decisions/security indexes and concepts, `resources/js/api/products.ts`, `resources/js/app.tsx`, `resources/js/components/WorkspaceShell.tsx`, `resources/js/screens/MasterDataScreen.tsx`, and `routes/api.php` / `routes/web.php`.
- Untracked P13 files: role-manager commands/models/services, membership and party exchange controllers/parsers, migration `000014`, P13 React screen/API/component/CSS, browser fixture/harness, `tests/Feature/P13AdministrationTest.php`, new OKF concepts/ADR, and generated P13 screenshots (including earlier acceptance retries, all retained). No files are staged.

## Completed Work

- Added separate organization role-manager grants, guarded local grant/revoke commands, manager-only membership and history APIs, expected-role conflict checks, atomic role audits, and workspace capability refresh.
- Added one CSV/XLSX party parser with shared normalized rows, database-collation duplicate detection, formula-cell rejection, create-only application, per-row durable outcomes/retry, filtered CSV export, and formula-safe output.
- Added the Persian P13 membership/audit screen and filtered party import/export controls. The role-admin screen is lazy-loaded to keep the initial entry bundle under the existing 500 kB build warning threshold.
- The full guarded suite passed 110 tests / 1,344 assertions on `erp_test`. `npm run typecheck` passed. After lazy-loading P13 administration, `npm run build` passed with a 497.55 kB entry chunk and 9.34 kB P13 chunk without a size warning. Composer validation, changed-file Pint, PHP/Node syntax, route registration, and `git diff --check` passed.
- The official OpenSpout 5.15.4 dependency is locked and installed; its Composer metadata supports the project's PHP 8.5 CLI and the required XMLReader/Zip extensions were present.

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
- Implemented and documented P12 organization-owned projects/tasks, status and completion rules, member assignment, comments, assigned-work inbox, persistent local due reminders, and unique exact-Rial P08 purchase-line associations.
- Added migration 000013, focused P12 feature coverage, Persian RTL workspace/list/board/task/inbox views, P08 source-line deep links, and P12 Chrome acceptance evidence.
- P12 focused guarded suite passed 7 tests / 133 assertions; the full serial suite passed 97 tests / 1,216 assertions. Typecheck, build, Pint, PHP/Node syntax, route listing, and diff checks passed.
- Migration 000013 applied in `erp_dev` and exercised on guarded `erp_test`; all observed pre-existing `erp_dev` counts remained unchanged. Chrome verified the assigned-editor journey, reminder deduplication, 1→0 open counts, 500,000-IRR purchase trace, 1280×900/390×844 layouts, focus, bright fallback, live Vite, and zero runtime errors.
- Reviewed the fingerprint-matched ERP mistakes log at `D:\All projects\Mistakes\ERP\mistakes.md`; no new reusable lesson was needed. All code/document changes remain unstaged.

## Work in Progress

P13 implementation, documentation, migration, browser acceptance, screenshots, and validation are complete. The full guarded suite passed 110 tests / 1,344 assertions. Chrome acceptance passed at 1280×900 and 390×844 plus bright forced fallback; the role change produced one audit event, no-op replay added none, CSV/XLSX preview rows matched, the retryable import created two accepted parties, and the downloaded filtered export IDs matched the register. Vite/P13 CSS loaded, keyboard focus was visible, mobile dock clearance was positive, and runtime errors were zero. Final OKF link/frontmatter validation and Git readbacks passed. The Notion queue and mistakes log are outside the writable workspace root and were not modified.

## Remaining Work

P13 is accepted. The shared Notion queue path `D:\All projects\notion\notion.md` exists outside the writable workspace root, so no local event could be appended. The fingerprint-matching mistakes log was reviewed; its React `currentTarget` lesson recurred, but the path is outside the writable root. The project AGENTS file now carries the correction. Do not call Notion APIs or use another path. P01–P13 remain local-development-only; do not use XAMPP or enable live/production posting.

## Exact Next Steps

1. For future P13 changes, run one guarded Laravel test process at a time and refresh only `erp_test` in tests.
2. Preserve the P13 role-manager grant, synthetic membership/audit rows, completed imports, imported parties, and screenshots in `erp_dev`.
3. Leave Git staging, commits, pushes, and branch changes to the user. Sync the shared Notion queue only after an explicit request and when its exact path is writable.

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
- P12: `app/Enums/WorkTaskStatus.php`, five work/cost models, migration `2026_11_26_000013_create_project_work_tables.php`, `ProjectWorkService.php`, `DueReminderService.php`, and the project/inbox API controllers.
- P12: `tests/Feature/P12ProjectWorkTest.php` and `scripts/Verify-P12Browser.mjs`.
- P12 UI: `resources/js/api/project-work.ts`, `resources/js/screens/ProjectWorkScreen.tsx`, and `resources/css/project-work.css`.
- P12 OKF: `architecture/p12-project-work.md`, `data/p12-project-work.md`, and `security/p12-project-work.md`.
- P12 Chrome evidence: six final screenshots linked from `docs/UI_DESIGN.md#p12-projects-and-assigned-work-evidence`.
- P13: `app/Models/OrganizationRoleManager.php`, `PartyImport.php`, `PartyImportRow.php`; migration `2026_11_26_000014_create_p13_admin_exchange_tables.php`; role-manager grant/revoke and synthetic browser-member commands; `MembershipAdministrationController.php`, `PartyDataExchangeController.php`; `OrganizationRoleManagerService.php`; `PartyImportParser.php`, `PartyImportService.php`, `PartyRegisterQuery.php`; `tests/Feature/P13AdministrationTest.php`.
- P13 UI and browser tooling: `resources/js/api/partyExchange.ts`, `MembershipAdministrationScreen.tsx`, `PartyImportPanel.tsx`, `resources/css/p13.css`, `scripts/Create-P13ImportFixture.php`, and `scripts/Verify-P13Browser.mjs`.
- P13 OKF: architecture, data, and security concepts; ADR-009; updated root, architecture, data, decisions, and security indexes, project overview/current architecture, and maintenance log.
- P13 Chrome evidence: seven final screenshots linked from `docs/UI_DESIGN.md#p13-administration-and-data-exchange-evidence`; earlier retries also left additional captures under `docs/screenshots/` and were preserved.

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
- P12: updated `AGENTS.md`, `HANDOFF.md`, `README.md`, `docs/UI_DESIGN.md`, OKF root/project/architecture/data/security indexes and log, current architecture, `app/Models/Organization.php`, `app/Models/User.php`, `app/Policies/OrganizationPolicy.php`, routes, `resources/js/app.tsx`, `WorkspaceShell.tsx`, and `PurchasingScreen.tsx`.
- P09 OKF: root/architecture/data/security/decision indexes, P09 architecture/data/security concepts, ADR-008, and `docs/okf/log.md`.
- OKF root/indexes, P05/P06 architecture/data/security/ADR documents, P08 concepts/ADR-007, project overview, and maintenance log.
- P13: `AGENTS.md`, `README.md`, `HANDOFF.md`, `docs/UI_DESIGN.md`, API/web routes, workspace/policy/role-service code, `PartyController.php`, Composer manifests, and related OKF indexes/concepts were updated with the local permission and exchange boundaries.

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
- P12 `viewWork` grants organization members read access and `manageWork` limits writes to editors. Assignees need an active-organization membership; reader assignment does not grant write access. All task, comment, inbox, and cost lookups remain parent/organization-scoped.
- P12 due dates are date-only in `config('app.timezone')` (currently UTC): reminders become eligible at the start of `due_on`; overdue begins at the start of the next day. Inbox entry posts the local reminder processor. Its persistent identity and unique key include task, assignment version, recipient, and due-date snapshot; completion hides the task, while reassignment invalidates the prior recipient's active reminder.
- P12 project costs link one eligible P08 purchase-order line to at most one project. P12 stores the exact `line_total_rial` and source-label snapshots; retries for the same project return that link, and a different project receives 409. P12 does not mutate P08 receipt/source lines, P06 stock, or P09/P10 postings.
- P13 membership-role authority is an explicit organization/user grant in `organization_role_managers`, independent from `reader`/`editor`. Managers may manage membership roles and read scoped history; ordinary editors keep only operational write authority. Only local/testing CLI commands grant or revoke the capability, and revocation refuses the last manager. A manager may change their own reader/editor role; the manager grant persists independently and workspace capabilities are re-read on the next request.
- P13 browser role writes resolve the target membership inside the active organization before validating role inputs, then lock the organization and membership, recheck the role-manager grant and expected current role, and write the change plus user audit row in one transaction. A stale expected role returns 409; an unchanged role is a no-op.
- P13 party exchange uses the same active-organization party register query for search/role filtering. The import template is `party_id,party_code,display_name,roles`; `party_id` is informational on import and exported as a source ID. `roles` accepts `customer`, `supplier`, or `customer|supplier`. CSV/XLSX normalize into one payload; only the first valid row per collated code is eligible. Existing codes are create-only duplicates and retain their data.
- P13 import preview is read-only. Apply binds organization + UUID key + normalized payload hash, rejects a changed payload for that key, and commits each party, its roles, and its row outcome atomically. Pending rows remain resumable after interruption. The existing organization-scoped `parties(organization_id, code)` unique index is the final concurrent-write guard.
- P13 XLSX reads only the first visible worksheet and rejects formula cells. CSV is UTF-8 with optional BOM and comma delimiters; the file limit is 5 MiB / 1000 data rows. XLSX codes must be stored as text. CSV exports preserve UTF-8 and code text, apply the same search/role filters, order by name then ID, and prefix formula-like cells with an apostrophe.

## Commands Executed

### P13 task

- The starting repository was clean `main` at `18b0103a1fcdc8fbab8dca37b1d1c3c6f13695c6`, matching `origin/main`; the current branch and HEAD remain unchanged. P13 work is unstaged and no files are staged.
- Laravel Boost read-only queries confirmed the `erp_dev` baseline on MariaDB 11.8.9: organizations/memberships/role audits 2/4/3, parties/roles 2/4, products 17, P08 orders 9, P10 invoices 8, P09 journals 30, and P12 projects 1. Migration `000014` was later applied additively to `erp_dev`; these preexisting counts matched immediately after migration.
- Docker Desktop's named pipe was unavailable to the normal shell. The existing local application was observed in Chrome; the isolated task-prefixed acceptance harness used OS temp for its profile. No Docker volume reset or XAMPP database change occurred.
- PHP 8.5.13 had the required XMLReader/Zip extensions. OpenSpout 5.15.4 was installed and locked; `composer validate --no-check-publish` passed.
- Party and membership role routes were listed. PHP syntax and `node --check scripts/Verify-P13Browser.mjs` passed.
- The full guarded serial Laravel suite passed 110 tests / 1,344 assertions on `erp_test`. `npm run typecheck`, `npm run build` (497.55 kB entry, 9.34 kB lazy P13 chunk), changed-file `vendor/bin/pint --test`, Composer validation, PHP/Node syntax, route registration, OKF validation, and `git diff --check` passed.
- Migration `2026_11_26_000014_create_p13_admin_exchange_tables` is applied in batch 11 on `erp_dev` and ran under guarded `erp_test`. Browser acceptance created retained synthetic local data; see Database or Migration State.

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

### P12 task

- Read-only baseline: clean `main` at `b18e24054962e1bf6648b2b31755d0ea8e709c86`; Laravel Boost `erp_dev` read showed migrations through 000012, MariaDB 11.8.9, 2 organizations, 4 memberships, 9 purchase orders/lines, 8 invoices, and 30 journals. P11 `PO-000009` line 9 retained its 500,000-IRR snapshot.
- `docker compose ps` via the authorized elevated shell confirmed the existing MariaDB container healthy on `127.0.0.1:3307 → 3306`. Read-only listener/process checks found ports 8000/5173 free before starting the local app.
- `C:\php8.5\php.exe artisan test --filter=P12ProjectWorkTest` — 7 tests / 133 assertions passed against guarded `erp_test`.
- `C:\php8.5\php.exe artisan test` — full serial guarded suite passed 97 tests / 1,216 assertions.
- `C:\php8.5\php.exe artisan migrate --path=database/migrations/2026_11_26_000013_create_project_work_tables.php --force --no-interaction` — applied migration 000013 to configured `erp_dev` only. Post-migration readback confirmed counts stayed at 2 organizations, 4 memberships, 9 P08 orders/lines, 8 P10 invoices, and 30 P09 journals. New P12 tables held 1 synthetic project, 1 task, 2 comments, 1 reminder, and 1 purchase-cost association after browser acceptance.
- `npm run typecheck`, `npm run build`, changed-file `vendor/bin/pint --test`, PHP syntax checks for P12 files, `php artisan route:list --path=projects`, and `git diff --check` passed. Production entry chunk is 487.20 kB and the lazy P12 chunk is 26.97 kB.
- `node --check scripts/Verify-P12Browser.mjs` passed. `node scripts/Verify-P12Browser.mjs` passed in isolated Chrome: P08 editor inbox count 1 → 0 after completion; reminder count 1, two repeated processor calls created 0/0 additional reminders; project list and board reconciled to 0 open / 1 completed; P11 `PO-000009` line 9 linked at exactly 500,000 IRR and its source row opened. At 1280×900 and 390×844, mobile width was 375/375 CSS px with the dock visible and no overlap, keyboard focus was visible, bright forced fallback showed 6 surfaces / 0 active refraction, live Vite client and `project-work.css` loaded, and Chrome reported 0 runtime errors. Six final screenshots are linked from `docs/UI_DESIGN.md#p12-projects-and-assigned-work-evidence`.
- `npm run dev` started Laravel/Vite only after port checks and was stopped after browser acceptance. The existing Docker MariaDB service was left running. No P10/P11 source record or XAMPP database was changed.

## Validation and Test Results

### P13 task

- Full guarded serial Laravel suite: 110 tests / 1,344 assertions passed on `erp_test`, including role self-change/next-request capability, reader/editor denials, 404 scoping, last-manager protection, optional CSV BOM, CSV/XLSX parity, formula/numeric-code rejection, preview zero-write, create-only retry, interrupted apply, concurrent unique constraint, filtered export, leading zeros, and formula escaping.
- `npm run typecheck` passed. Final `npm run build` passed with a 497.55 kB entry and 9.34 kB lazy P13 administration chunk without a size warning.
- Changed-file `vendor/bin/pint --test` passed; Composer validation, route registration, PHP/Node syntax checks, OKF 0.2 validation (50 Markdown files, 44 typed concepts, 311 internal Markdown links), and final `git diff --check` passed. A whole-project Pint run also reports existing formatting issues in unchanged `app/Support/DatabaseTestSafetyGuard.php`.
- Isolated Chrome at 1280×900/390×844 and bright forced fallback passed. The P13 CSS and live Vite client loaded, document widths had no horizontal overflow, mobile content cleared the dock by about 82 px at scroll end, focus was visible, active refraction was zero in fallback, and runtime errors were 0. Seven final screenshots are linked in `docs/UI_DESIGN.md`.
- Migration 000014 is applied in `erp_test` through guarded refresh and in `erp_dev` as batch 11. Read-only before/after migration counts matched; browser acceptance later added only synthetic P13 data.

### P11 task

- Focused `php artisan test --filter=P11DashboardTest`: 5 tests / 122 assertions passed. Full serial `php artisan test`: 90 tests / 1,083 assertions passed against guarded `erp_test`.
- `npm run typecheck`, `npm run build`, changed-file Pint, `node --check scripts/Verify-P11Browser.mjs`, and `git diff --check` passed. No P11 schema migration was required.
- Symfony YAML and internal-link validation passed for OKF 0.2: 43 Markdown files, 37 concept documents with required `type`, root-only version metadata, and 250 valid internal links.
- P11 Chrome harness expected/observed totals matched for organization 1 / book 2 / 2026-11-26: net sales 5,000,000 IRR, overdue 600,000 IRR, available stock 131.500 EA across 15 rows, and one pending approval. The detail lists contained 5 / 1 / 15 / 1 source rows.
- Historical checks returned overdue 0 on the invoice due date 2026-11-24, 1,000,000 IRR on 2026-11-25 before the 2026-11-26 receipt, and 600,000 IRR afterward. A second same-organization book returned zero sales. Toman values were 500,000 and 60,000.
- Chrome verified confirmed sales order/delivery, independent purchase approval/order/receipt, and both invoice/settlement cards; each P11 seed replay returned the same source IDs and balances. At 390×844, document/client widths were 375/375 CSS px and the report cleared the dock by 82.08 px. Keyboard focus was visible; bright fallback retained three glass surfaces and zero active refraction; Vite `dashboard.css` loaded; runtime errors: 0.
- The user's existing Chrome profile was signed out at the local app. The isolated Chrome harness used the local P03 fixture, and no credentials were entered into the user's profile. Screenshots are linked from `docs/UI_DESIGN.md#p11-reconciled-dashboard-evidence`.

### P12 task

- Focused `php artisan test --filter=P12ProjectWorkTest`: 7 tests / 133 assertions passed. Full serial `php artisan test`: 97 tests / 1,216 assertions passed against guarded `erp_test`.
- The feature suite uses fixed UTC dates to verify due/overdue cutoffs, one-time reminder processing, reassignments, completion replay, inbox/project counts, foreign IDs, reader write denials, and purchase-line retries/snapshots.
- `npm run typecheck`, `npm run build`, changed-file Pint, changed-file PHP syntax checks, `php artisan route:list --path=projects`, `node --check scripts/Verify-P12Browser.mjs`, and `git diff --check` passed. OKF 0.2 was preserved.
- Symfony YAML/frontmatter and internal-link validation passed for 46 OKF Markdown files, 40 typed concept documents, 278 internal links, and root-only OKF 0.2 metadata.
- Migration 000013 applied to `erp_dev` and ran via `RefreshDatabase` on guarded `erp_test`. `erp_dev` counts after migration remained organizations 2, memberships 4, purchase orders/lines 9/9, invoices 8, and journals 30. P11 purchase order 9 / line 9 remains `P11-WALKTHROUGH-ITEM` at 500,000 IRR.
- Chrome P12 harness passed on 2026-11-26. The assigned editor's inbox/project open count changed 1→0 after task completion; the project list and board both showed 0 open / 1 completed. Two repeated reminder process requests each created 0 new reminders, and the inbox had 0 due reminders after completion. The cost link opened P08 `PO-000009` line 9 with exact 500,000 IRR.
- Chrome captured 1280×900 desktop and 390×844 mobile evidence. The mobile document/client widths were 375/375 CSS px; the dock was visible and cleared content by 100.23 px at initial position and 194.23 px at scroll end. Keyboard focus was visible. Bright fallback showed 6 glass surfaces / 0 active refraction, live Vite and `project-work.css` loaded, and runtime errors were 0. Six final screenshots are linked from `docs/UI_DESIGN.md#p12-projects-and-assigned-work-evidence`.

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

- P13 is accepted at its local boundary. Live/production role administration and posting remain out of scope.
- The normal sandbox cannot connect to the local MariaDB socket or Docker Desktop API. Laravel Boost was used for read-only checks; the guarded tests and additive local migration used the reviewed elevated command path.
- `D:\All projects\notion\notion.md` exists outside the writable workspace root. The P13 local queue event cannot be appended from this sandbox; do not call Notion APIs or use another path.
- The project mistakes log was fingerprint-verified and reviewed, but could not be edited outside the writable root. The recurring React event-capture rule was added to `AGENTS.md`.

- The six P10 workflow rules and exact organization 1 / book 2 / account mapping are approved for the local ERP MVP only and recorded in ADR-008. Production/live mappings, tax and costing treatment, treasury policy, and a coordinated correction workflow remain outside scope; do not activate a live profile from this local approval.
- P10 local acceptance passed, with no remaining local engineering blocker. The boundary is explicit: new postings into a closed period are rejected, exact retries return existing records, and P10 journals cannot be independently reversed. P11 is ACCEPTED at its local read-only dashboard/walkthrough boundary; live/source posting remains disabled.
- P12 is ACCEPTED at its local project-work boundary. No P12 engineering or acceptance blocker remains. Live/production posting and deployment remain outside scope.
- An early test attempt overlapped because a wrapper did not capture/poll a session. The corrected focused and full suites both passed serially; preserve the existing one-test-process rule for future suites.

- P08 has no implementation blocker. The user's Chrome session was a reader in organization B; it rendered the P08 read-only list. The isolated Chrome harness used local synthetic editor and approver accounts for write acceptance.
- P09 is accepted for manual synthetic journals. Source-driven sales/purchase recognition, tax, inventory costing, cash/bank settlement, and production closed-period corrections remain unapproved and disabled as recorded in ADR-008.
- The user's Chrome profile remained signed out at `/sign-in` when inspected with Computer Use; the isolated Chrome acceptance harness used the existing ignored local P03 editor credential and verified the authenticated P09 workflow.
- Resolved during P11 acceptance: initial browser harness runs stored Chrome profiles in `storage/framework/testing`, and Laravel Boost emitted `EBUSY` watcher warnings while Chrome wrote cache files. The P11 harness now uses a task-prefixed OS temp directory; the seven earlier P11 profile directories were checked for holders and removed by verified exact-path cleanup. No P11 browser profile remains in repository storage.
- One temporary profile from an early failed P08 browser startup remains under ignored `storage/framework/testing/p08-browser-PqwoMj` because Windows reported an `EBUSY` file lock. The final harness cleanup completed successfully; no profile cleanup was attempted outside the exact generated directory.
- The requested GPT-6 Luna/max execution profile was not exposed for verification.
- The prior handoff's `dc0c130` HEAD and unstaged P07 state did not match the actual clean `f876fc5` P07 commit at this task's start; the handoff was reconciled before P08 work.

## Risks and Assumptions

- P13 remains local-only. Role-manager CLI commands are restricted to local/testing; no live role administration or external deployment is authorized.
- P13 migration 000014 is additive; it is applied to both `erp_test` and `erp_dev`. The P13 browser harness created retained synthetic member audits, role-manager grant, seven completed import requests with row results, and P13 parties in `legacy-local`; preserve them with the P01–P12 fixtures.
- The P13 import template is the only accepted header set. Codes that can lose leading zeros in XLSX must be stored as text; CSV remains UTF-8 text and spreadsheet-like formula prefixes are apostrophe-escaped on export.

- Existing P07 fixtures remain in `erp_dev`. P08 acceptance added synthetic records that were preserved: 8 purchase requests, 8 orders, 12 receipts, and four products in the default organization. Product 16 has a main-order receipt increase of 5.000 and a separate 1.000 last-unit contention receipt at the same location; its current physical/reserved/available balance is 16.000/4.000/12.000.
- Results establish local development behavior only.
- P09 browser acceptance preserved its synthetic fixtures in `erp_dev`: book 1 (`P09-BR-MWRJ62AX`), five accounts, four periods, twelve journals, twenty-four lines, and ten idempotency request keys. Journals 6–9 and 11 are one-rial contention fixtures from repeated harness runs; journals 10 and 12 are drafts left by close/post races. Period 2 was closed in the UI after the final posting checks. Do not delete them as cleanup.

## Database or Migration State

- P13 migration `2026_11_26_000014_create_p13_admin_exchange_tables` ran through guarded `RefreshDatabase` in `erp_test` and is batch 11 in `erp_dev`. Before migration, read-only `erp_dev` counts were organizations/memberships/role audits 2/4/3, parties/roles 2/4, products 17, P08 orders 9, P10 invoices 8, P09 journals 30, and P12 projects 1; the same counts held immediately after migration. The P13 browser harness then created synthetic local acceptance data. Current read-only `erp_dev` counts are organizations/memberships/role audits 2/7/6, parties/roles 31/40, products 17, P08 orders 9, P10 invoices 8, P09 journals 30, P12 projects 1, role-manager grants 1, party import requests/rows 7/35. The 7 imports are completed; do not clean them up.

- P10 migration `2026_11_24_000012_create_p10_settlement_tables` is applied as batch 9 in `erp_dev` and `erp_test` reports it `Ran` through the guarded suite.
- Before/after `erp_dev` counts matched for all observed P01–P09 tables: organizations 2, products 16, parties/roles 2/4, units 3, warehouses/locations 17/17, price lists/entries 3/11, leads/activities 12/5, quotes/lines 11/13, sales orders/lines 9/11, stock locks/operations/movements/reservations 15/32/33/14, deliveries 4, purchase requests/lines 8/8, purchase orders/lines 8/8, receipts 12, accounting books/accounts/periods/journals/lines/request keys 1/5/4/12/24/10. The volume was not reset.
- Synthetic Chrome acceptance added `P10-SYNTH-BROWSER` book 2, period 5, one `synthetic_test` profile, and six accounts. It now contains six invoices, eight invoice lines, six open items, eight treasury movements, and eight allocations. P10 journals are 13–26 in book 2. Customer invoices 1–5 and supplier invoices 3 and 6 are retained synthetic acceptance records; do not clean them up. P09 manual book 1 and journals 1–12 remain separate and unchanged.
- `erp_test` may be rebuilt only through the verified guarded Laravel test workflow; do not target `erp_dev` with `RefreshDatabase`.
- Docker Compose `db` service is running and reported healthy. The named volume was not reset.

- P11 adds no migration. The local command created synthetic product 17 / location 18, sale order 10 / delivery 5, purchase request 9 / order 9 / receipt 13, P10 customer/supplier invoices 7/8, treasury movements 9/10, and linked P09 journals 27–30. It also left request 10 submitted for approval. The dedicated P11 product/location is 10.000 EA physical, 0.000 reserved, and 10.000 available after the sale issue and purchase receipt. The command replay returned the same IDs without increasing these counts.
- The local P10 profile remains organization 1 / book 2 / `synthetic_test` with the ADR-008 mapping and null approval metadata. P09 manual book 1 / journals 1–12 are preserved. No P11 schema migration was applied.
- The full guarded `erp_test` suite passed 90 tests / 1,083 assertions after migrations through 000012; its RefreshDatabase operations never targeted `erp_dev`.
- P12 migration `2026_11_26_000013_create_project_work_tables` is applied in batch 10 in `erp_dev` and ran via guarded `RefreshDatabase` in `erp_test`. Post-migration `erp_dev` counts are organizations/memberships 2/4, purchase orders/lines 9/9, P10 invoices 8, and accounting journals 30; all match the read-only P12 baseline. The persistent volume was not reset.
- Local Chrome acceptance created/reused work project 1, task 1, two comments, one due reminder, and one project cost. Task 1 is completed by the assigned editor. Its due reminder row remains deduplicated but is no longer returned in the active inbox. Cost 1 links project 1 to P11 purchase order 9 / line 9 for 500,000 IRR; source P08 records are unchanged.

- P09 migrations 000010 and 000011 were exercised by guarded `erp_test`. Both are applied in batch 8 to existing `erp_dev`. It contains one book, five accounts, four periods, twelve journals, twenty-four lines, and ten request-key rows from synthetic acceptance.

- `erp_dev`: MariaDB 11.8.9 has P08 migration `2026_11_21_000009_create_p08_purchase_tables` applied in batch 7 to the existing volume. At migration time, products were 11/1 by organization, inventory operations were 10 opening / 5 issue / 1 transfer, and sales orders were 9; those counts were unchanged by migration.
- `erp_test`: full guarded suite passed 78 tests / 825 assertions after migrations through 000011. Do not reset `erp_dev`; `Tests\TestCase` guards test database refreshes.

## Configuration and Environment Notes

- OpenSpout 5.15.4 is in `composer.json`/`composer.lock` for XLSX reading. It supports PHP 8.5; the checked local PHP 8.5.13 runtime has `ext-xmlreader` and `ext-zip` enabled.
- The local Chrome tab was authenticated and rendered `/` at baseline. The isolated P13 harness uses a task-prefixed directory under the OS temp path and must stop Chrome before removing that exact profile.

- `erp_dev` P09 migration state and P01–P09 row counts were read before migration 000012 was applied. `.env` and `.env.testing` were not changed; the test guard targets `erp_test`.
- P10 invoice/settlement writes are internally replayable and transaction-bound. Its profile remains `synthetic_test` with the exact six local accounts in ADR-008; the user approval did not create or enable a live `approved` profile.

- `.env`, `.env.testing`, and examples were not changed. PHP 8.5.13 is at `C:\php8.5\php.exe`; MariaDB uses loopback port 3307. P03/P08 synthetic credentials remain only in ignored private storage and were not printed.
- The P12 date-only due/reminder contract reads `config('app.timezone')`; the current value is UTC. No new environment variable is required.
- P12 date-only task cutoffs use `config('app.timezone')`, currently `UTC`; reminder eligibility begins at 00:00 on the due date and overdue starts the following day.
- The normal command sandbox cannot reach the DB host port; tests, the additive migration, and local Chrome harness provisioning used the permitted elevated path.
- During Chrome acceptance, `npm run dev` served the app on ports 8000/5173 and was stopped after the final run; the ports were free afterward. The final P11 harness uses OS temp for isolated Chrome profiles so Laravel's watcher does not scan Chrome cache files. Seven earlier `p11-browser-*` directories under ignored `storage/framework/testing` were confirmed unheld and removed by exact-path cleanup; none remain.
- P12 Chrome ran in a fresh `erp-p12-browser-*` directory under OS temp and the harness removed that generated profile after Chrome exited. The P12 acceptance run saved six final linked screenshots and some earlier unlinked retry captures under `docs/screenshots/`.

## Uncommitted or Partially Applied Changes

- P13 code/docs/screenshots are unstaged on `main` at the original HEAD `18b0103a1fcdc8fbab8dca37b1d1c3c6f13695c6`; no staging/commit/push/branch change has occurred.
- P13 migration 000014 and retained synthetic browser fixtures are present in `erp_dev`. `erp_test` was rebuilt only through the guarded passing test workflow.
- The mandatory P13 Notion queue event is blocked by the workspace write boundary; no event was appended and no Notion API was called.

- All P12 code, tests, documentation, and screenshots are unstaged on `main` at HEAD `b18e24054962e1bf6648b2b31755d0ea8e709c86`, matching `origin/main` (0 ahead/behind). No files are staged, committed, pushed, or on a new branch. No unrelated pre-existing worktree changes existed at P12 start.
- P10 migration 000012 is applied in both `erp_test` and `erp_dev`. The `P10-SYNTH-BROWSER` book, invoices, treasury movements, allocations, linked journals, and screenshots are intentional synthetic acceptance data retained for review.
- The starting HEAD contains the accepted P07/P08/P09/P10 baseline. P11 made no migration and no change to P10 profile configuration.
- The earlier overlapping P10 test attempt was superseded by successful serial focused/full runs. P10 acceptance rows and the synthetic profile are intentionally retained only in `P10-SYNTH-BROWSER` in `erp_dev`.
- Earlier P07 event `erp-p07-sales-order-fulfillment-20261121T172436Z-82e0d709-8890-4ab4-a65d-ed3df03b9d37` remains `PENDING` in `D:\All projects\notion\notion.md`.
- P08 event `erp-p08-purchase-request-to-receipt-20261122T051859Z-4e82c0a6-7d21-4b5e-9731-6b48be21a7dc` was appended as `PENDING` and verified by readback. No remote sync was done.
- P10 events `erp-p10-customer-supplier-settlement-20261124-1e0754c4-488d-41e7-a858-5998c508ac84` and `erp-p10-local-mvp-acceptance-20261124-65bf8ae5-d503-4d00-92be-6d1cc4288a5e`, and P11 event `erp-p11-local-mvp-acceptance-20261126-f12edeed-504f-41d5-bb7c-78966676ce3a`, are in the shared queue with `PENDING` state. No Notion API was called.
- P12 event `erp-p12-local-mvp-acceptance-20261126-3d75bfe0-0b2d-40b7-8b0d-9f1ee2b44c98` was appended under the existing queue lock and read back as `PENDING` with no changes. No Notion API was called.
- P12 synthetic acceptance data in `erp_dev` is retained for review: project 1, completed task 1, project/task comments, one persistent due reminder, and one unique 500,000-IRR cost link to P11 line 9. P08 source row snapshots remain unchanged.

## Recovery or Rollback Notes

- Do not roll back `erp_dev`; it contains preserved P01–P07 data and synthetic P08 purchase/receipt fixtures.
- The verified P07-only test command is `artisan migrate:rollback --database=mariadb --path=database/migrations/2026_11_21_000008_add_p07_sales_fulfillment.php --env=testing --force`. It removes P07 fields/table, preserves P06 tables, and restores the P06 operation FK/support index. Reapply only against guarded `erp_test`.
- P08 migration 000009 is additive. No P08 rollback rehearsal was run; keep `erp_dev` at P08 and do not remove its accepted P08 synthetic receipt fixtures.
- P09 migrations are additive. Rolling back 000011 removes only the journal-line CHECK; rolling back 000010 drops the six P09 tables and all P09 books/accounts/periods/journals/lines/retry records. Do not roll them back in `erp_dev`; any rehearsal must target guarded `erp_test` only.
- P10 migration 000012 adds P10 tables and two source-trace unique indexes. It is applied in `erp_test` and `erp_dev`; do not roll it back from `erp_dev`. Any P10 rollback rehearsal must be separately authorized and target guarded `erp_test` only.
- P11 creates only stable synthetic business records through accepted local workflows. It has no schema rollback; do not delete the accepted walkthrough fixture or reset `erp_dev`.
- P12 migration 000013 adds five new tables. It is applied in `erp_test` and `erp_dev`; `erp_dev` now contains the accepted synthetic project, completed task, comments, persistent reminder, and cost link. Do not roll back P12 or delete these records in `erp_dev`; any rollback rehearsal must target guarded `erp_test` only.
- Do not run `migrate:fresh`, reset the MariaDB volume, or delete generated evidence.

## Related Documentation

- [Project instructions](AGENTS.md), [README/runbook](README.md), [phase roadmap](docs/MASTER_PLAN.md), [OKF index](docs/okf/index.md), [P10 UI evidence](docs/UI_DESIGN.md#p10-customer-and-supplier-settlement-evidence), and [P11 UI evidence](docs/UI_DESIGN.md#p11-reconciled-dashboard-evidence).
- [P07 workflow](docs/okf/architecture/p07-sales-fulfillment.md), [data](docs/okf/data/p07-sales-fulfillment.md), [security](docs/okf/security/p07-sales-fulfillment.md), and [ADR-006](docs/okf/decisions/adr-006-p07-reserved-sales-order-issues.md).
- [P08 workflow](docs/okf/architecture/p08-purchasing.md), [data](docs/okf/data/p08-purchasing.md), [security](docs/okf/security/p08-purchasing.md), and [ADR-007](docs/okf/decisions/adr-007-p08-purchase-approval-and-pricing.md).
- [P09 workflow](docs/okf/architecture/p09-accounting.md), [data](docs/okf/data/p09-accounting.md), [security](docs/okf/security/p09-accounting.md), [ADR-008](docs/okf/decisions/adr-008-p09-accounting-scope-and-posting-decisions.md), and [P09 UI evidence](docs/UI_DESIGN.md#p09-accounting-evidence).
- [P10 workflow](docs/okf/architecture/p10-settlement.md), [data](docs/okf/data/p10-settlement.md), [security](docs/okf/security/p10-settlement.md), [ADR-008 live-rule decisions](docs/okf/decisions/adr-008-p09-accounting-scope-and-posting-decisions.md), and [P10 UI evidence](docs/UI_DESIGN.md#p10-customer-and-supplier-settlement-evidence).
- [P11 workflow](docs/okf/architecture/p11-dashboard.md), [reporting data](docs/okf/data/p11-reporting.md), [security](docs/okf/security/p11-reporting.md), and [P11 UI evidence](docs/UI_DESIGN.md#p11-reconciled-dashboard-evidence).
- [P12 workflow](docs/okf/architecture/p12-project-work.md), [data](docs/okf/data/p12-project-work.md), [security](docs/okf/security/p12-project-work.md), and [P12 UI evidence](docs/UI_DESIGN.md#p12-projects-and-assigned-work-evidence).

## Notes for the Next Agent

P09 remains accepted at its local manual/synthetic boundary. P10 is ACCEPTED for the local ERP MVP only; P11 is ACCEPTED for local read-only reporting and synthetic walkthroughs only. Preserve P08 fixtures, P09 manual journals, P10 synthetic book 2/profile and prior settlements, the new P11 product/workflow fixtures, and screenshots. No P11 migration was added. Live/production posting remains disabled. Read [ADR-008](docs/okf/decisions/adr-008-p09-accounting-scope-and-posting-decisions.md) before changing posting gates. Run only one guarded Laravel test process at a time; capture and poll its session to completion. The fingerprint-verified ERP mistakes log now records the temp-profile watcher correction. Local queue events `erp-p10-customer-supplier-settlement-20261124-1e0754c4-488d-41e7-a858-5998c508ac84`, `erp-p10-local-mvp-acceptance-20261124-65bf8ae5-d503-4d00-92be-6d1cc4288a5e`, and `erp-p11-local-mvp-acceptance-20261126-f12edeed-504f-41d5-bb7c-78966676ce3a` remain `PENDING`; do not sync unless the user explicitly requests it. No Notion API was called.

P12 is ACCEPTED at its local boundary. Preserve the P12 project/task/comments/reminder/cost link and the P11 source line 9; the linked amount is an immutable 500,000-IRR snapshot. Migration 000013 is applied to `erp_dev`; use only guarded `erp_test` for rollback rehearsals. `config('app.timezone')` is currently UTC for task due-date/reminder cutoffs. The isolated P12 Chrome profile and local dev servers were stopped after acceptance. Queue event `erp-p12-local-mvp-acceptance-20261126-3d75bfe0-0b2d-40b7-8b0d-9f1ee2b44c98` remains `PENDING` until an explicit user sync request.
