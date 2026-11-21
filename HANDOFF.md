# Project Handoff

## Last Updated

2026-11-21

## Project Summary

Local-development-only ERP prototype. P01–P06 are accepted at their local-development boundaries. Runtime data is synthetic and stored in local MariaDB.

## Current Objective

P06 — Trustworthy Stock Balances — is accepted. Stop at P06 as requested; preserve accepted P01–P05 and do not begin P07 without a new request.

## Current Phase or Milestone

P01–P06 are accepted. P06 tables, scoped APIs, exact quantity arithmetic, stock-key locking, operations/reservations, Persian views, OKF/README/UI evidence, live Chrome acceptance, development migration, and guarded P06-only rollback/reapply are verified. Final serial suite passed 50 tests / 464 assertions after reapply.

## Repository State

- Repository path: `D:\All projects\ERP`
- Current branch: `main`
- Base or starting commit: `e86ebbb5193f3bda5e9ec77a6773de8864d578f5`
- Current HEAD: `e86ebbb5193f3bda5e9ec77a6773de8864d578f5`
- Working tree status: P06 source/docs/screenshots are unstaged on the original `main` branch at HEAD `e86ebbb5193f3bda5e9ec77a6773de8864d578f5`. Git fsmonitor reported an unavailable IPC endpoint; status was inspected with `core.fsmonitor=false`.
- Staged changes: none
- Unstaged changes: HANDOFF, AGENTS, README, UI_DESIGN, ProductController, LocationController, Organization, OrganizationPolicy, products.css, app.tsx, WorkspaceShell, routes/api.php, routes/web.php, and P06 OKF documents/indexes/log.
- Untracked files: P06 stock controller/models/service/migration, React API/screen, concurrency and browser helpers, P06 feature tests, P06 OKF concepts/ADR, and four P06 screenshots.

## Completed Work

- Preserved the P01/P02 product API and UI, including `{ data: [{ id, code, name }] }`, `/products`, numeric detail routes, filtering, quick-view keyboard behavior, and reusable glass controls.
- Added session login/logout with server-side credential validation, generic failures, rate limiting, session regeneration on login, invalidation and CSRF-token regeneration on logout.
- Added explicit matching CSRF-token enforcement for login, logout, active-organization switching, and product PATCH requests. Browser-only same-origin metadata is not accepted as a substitute for the token.
- Added organizations, unique user/organization memberships, membership-scoped `reader`/`editor` roles, current-membership resolution, allowed organization switching, and denial for missing/stale/unowned memberships.
- Applied forward migrations 000002–000004 to the existing development database. The existing product remains ID 1, code `DEMO-001`, name «کالای نمونه», now owned by `legacy-local` («سازمان پیش‌فرض»). The code index is unique on organization plus code; its rollback refuses cross-organization duplicate codes.
- Added organization-scoped product list and PATCH name update, policy enforcement after scoped lookup, consistent 404 for foreign/unknown IDs, and rejection of ownership/role fields.
- Added transactional role assignment audit and local role command. Reassigning an unchanged role does not create a duplicate audit row.
- Added repeatable synthetic provisioning. Two runs left 2 organizations, 3 memberships, 3 role-audit rows, and 2 products. Both organizations have their own `DEMO-001`.
- Generated demo credentials are in ignored `storage/app/private/p03-demo-credentials.json`; the command and browser evidence output do not print them.
- Added Persian sign-in/denied states, active organization and role display, allowed organization selector, sign-out, and capability-gated edit form. Adjusted mobile detail spacing after measuring overlap; final mobile detail-to-dock clearance is 51.31 CSS px with no horizontal overflow.
- Updated README, OKF concepts/indexes/log, screenshots, and this handoff for the accepted P03 state.
- Added forward migration `2026_11_20_000005_create_p04_master_data_tables.php`; existing products ID 1 and 2 retained their IDs, owners, codes, and names. Their unknown base units remain `NULL`.
- Added party and role, unit, warehouse, location, price-list and entry models/controllers, an organization policy, scoped API routes, location pair validation, explicit price resolution, product base-unit endpoints, and editor capability reporting.
- Added repeatable P04 synthetic records to the existing P03 provisioning flow. Two runs kept 2 organizations, 3 memberships, 3 role-audit rows, 3 products, 1 seeded dual-role party, 2 roles, 3 units across two organizations, 2 warehouses, 2 locations, 2 price lists, and 2 price entries.
- Added one shared Persian RTL register/form pattern for parties, units, warehouses, locations, and price lists; added product code/base-unit editing and creation while retaining the P02 product collection contract, name-only PATCH, filter, detail route, and quick view.
- Added eight P04 feature tests covering shared party roles, exact selected-list rial values and unpriced state, scoped codes, foreign IDs/units, warehouse-location matching, reader writes, organization switching, repeat provisioning, and schema constraints.
- Completed Chrome acceptance at 1280×900, 390×844, and forced bright glass fallback. Seven final screenshots are linked from `docs/UI_DESIGN.md`; no browser runtime errors occurred. Mobile party-form action ended at y=609.53 and location-selector action at y=622.31; both were above the dock at y=770. `document.scrollWidth` and `clientWidth` were both 375 px in the 390 px emulated window.
- Rehearsed P04-only rollback/reapply on `erp_test`. The rollback removed P04 tables and `products.base_unit_id` while retaining P03 `products` and `organization_id`; reapply succeeded and the final guarded suite passed again.
- Updated `AGENTS.md`, README, P04 OKF architecture/data/security/decision concepts and indexes, the OKF maintenance log, and the UI evidence. OKF validation passed for 17 Markdown files, the root OKF 0.2 declaration, concept types, and 63 internal targets.
- Created the verified ERP-specific mistakes log with one reusable note about serial use of the shared `erp_test` schema. Appended report-only P04, launcher, and font events to the local Notion queue; all remain `PENDING`, and no Notion API was called.
- Added a dependency-free Node launcher: `npm run dev` starts `php artisan serve` on 8000 and Vite on 5173, handles their exit/shutdown together, honors `ERP_PHP_BINARY`, and never invokes Docker. `npm run dev:vite` remains available for a Vite-only session.
- Updated README, AGENTS, current runtime/P04 architecture OKF documents, and the OKF log to document the one-command startup while keeping the user-managed DB lifecycle manual.
- No migrations, provisioning, or database tests were run for the launcher change; no database or Docker state was modified. The existing P04 suite still has 36 passing tests / 213 assertions.
- Copied all 18 user-provided IranSansX WOFF2 files into `resources/fonts/iran-sans-x/`: nine static weights each for standard and FaNum variants.
- Registered weights 100–900 per family. Persian UI text uses `IRANSansXFaNum`; LTR fields and identifiers use standard IRANSansX where applicable, while monospace code styling remains with FaNum glyph fallback.
- Updated README, UI design, UI workspace architecture, and the OKF log with the local font and weight mapping.
- Implemented P05 organization-scoped leads, customer validation, dated lead activities with strict `due_at < now()` overdue cutoff and idempotent completion, searchable registers/details, draft quotes, editable/repriceable lines, confirmation, and confirmed sales orders. Readers can view; editor writes are checked server-side.
- Added forward migration `2026_11_21_000006_create_p05_sales_tables.php` with composite organization foreign keys, unique source quote/order and source quote-line/order-line constraints, snapshot fields, and P07 source-line links. Applied it to `erp_dev`; P05-only rollback/reapply was rehearsed on `erp_test` and P04 remained applied.
- Kept P04 price entries in rials. P05 persists the exact source value as tenths of a toman, calculates with scaled integers and half-up whole-toman line rounding, sends exact amount strings, and refreshes prices only when a draft line is added or explicitly repriced. A quantity/discount edit preserves its saved price.
- Added repeatable `P05DemoSeeder` fixtures: products P05-DEMO-001/002 with EA and a P05-QUOTE price list at 1,200,000/1,350,000 rials, rendering as 120,000.0/135,000.0 toman. Running `p03:provision-demo` twice preserved P04 product IDs/prices and the P05 fixture.
- Added the Persian RTL sales workspace, shared shell navigation, lead/activity/quote/order links, accessible forms and status feedback, sharp Toman values, and reduced-transparency/forced-fallback styling.
- Verified the exact fixture lines at 135,000 and 43,831 toman and total 178,831 toman, plus the half-Toman rounding edge. Guarded Laravel suite passed 45 tests / 363 assertions after migration rehearsal; TypeScript, production build, PHP syntax, and changed-file Pint passed.
- Chrome acceptance passed at 1280×900 and 390×844, with Tab/Enter form submission, overdue completion and queue reload, zero/missing price and unit validation coverage, reader 403s, forced bright fallback with SVG refraction disabled, and zero browser runtime errors. Two conversion requests waited on a held MariaDB quote-row lock and returned 201/200 with the same order; only one source order and two copied lines existed.
- An authorized P04 price-list update was read back while the confirmed quote and order retained their Toman price, line, label, and total snapshots. The seeded P05 price was restored to 1,200,000 rials afterward.
- Added P05 UI screenshots, README/runbook details, project AGENTS scope, P05 OKF architecture/data/security/ADR documents and indexes/log, and this handoff. The OKF validation parsed 21 Markdown files, 15 concepts, and 91 internal file links without errors.
- Added P06 migration `2026_11_21_000007_create_p06_inventory_tables.php`, organization/product/location lock rows, exact integer-thousandth operation/reservation records, composite ownership constraints, stock APIs/policies/services/models, and P04 guards against changing a base unit or location warehouse after a stock key exists.
- Added P06 API routes and Persian workspace views for balances, immutable movement history, reservations/releases, opening/receipt/issue/transfer forms, reader/editor visibility, accessible validation feedback, and forced Liquid Glass fallback. P06 remains independent of sales-order lines for P07 extension.
- Added `tests/Feature/P06StockWorkflowTest.php` for exact balances, idempotent create/release, paired transfer legs and injected second-leg rollback, issue/reservation availability, precision/missing-unit validation, reader denial, CSRF, foreign IDs, warehouse/location mismatch, opening rule, and P06 master-data locks.
- Added `scripts/Verify-P06Browser.mjs`, `Lock-P06StockForConcurrency.php`, and `Verify-P06StockRows.php`. Chrome used existing fixtures: P05-DEMO-001 ID 4 and P05-DEMO-002 ID 5 (`EA`), DEMO-002 ID 3 (`EA`), unitless DEMO-001 ID 1, and LOC-A-01/LOC-B-01 IDs 1/2. Four synthetic screenshots are linked from `docs/UI_DESIGN.md#p06-verification-evidence`.
- Updated P06 OKF workflow/data/security/ADR documents and indexes/log, AGENTS, README, UI_DESIGN, and this handoff; adopted OKF version remains 0.2.

## Work in Progress

None. P06 is accepted and this request is complete. The requested GPT-6 Luna/max execution profile was not exposed for verification. Local P06 Notion queue events remain pending explicit sync; no Notion API was called.

## Remaining Work

No P06 acceptance work remains. The first auto-review attempt for rollback was rejected; after the user's explicit authorization, the exact P06-only rollback/reapply was run and verified. All requested implementation, browser, suite, build, style, docs, and local-queue work is complete. Stop at P06; do not begin P07.

## Exact Next Steps

P06 is complete; stop here. If the user later requests another phase, reread current Git/HANDOFF/OKF state and start that phase only. Preserve `erp_mariadb_data`, existing product IDs/units, and all P04–P06 contracts. Do not stage, commit, push, reset, or change branches.

## Files Created

- `app/Console/Commands/AssignOrganizationRole.php`, `ProvisionP03Demo.php`
- `app/Enums/OrganizationRole.php`
- `app/Http/Controllers/Auth/SessionController.php`, `Api/V1/WorkspaceController.php`
- `app/Http/Middleware/ResolveActiveOrganization.php`, `RequireExplicitCsrfToken.php`
- `app/Models/Organization.php`, `OrganizationMembership.php`, `OrganizationRoleAudit.php`
- `app/Policies/ProductPolicy.php`, `app/Services/MembershipRoleService.php`
- `database/migrations/2026_11_20_000002_create_organizations_and_memberships_tables.php`, `000003_add_organization_ownership_to_products.php`, `000004_scope_product_code_uniqueness_to_organization.php`
- `database/seeders/P03DemoSeeder.php`
- `resources/js/screens/SignInScreen.tsx`, `AccessDeniedScreen.tsx`
- `tests/Feature/P03OrganizationAccessTest.php`, `SessionAuthenticationTest.php`
- P04 API/controllers/models/policy, additive migration, repeatable `P04DemoSeeder`, `resources/js/api/masterData.ts`, `resources/js/components/LabeledInput.tsx`, `resources/js/screens/MasterDataScreen.tsx`, `tests/Feature/P04MasterDataTest.php`, and `scripts/Verify-P04Browser.mjs`
- P04 OKF architecture/data/security/ADR documents and seven final screenshots listed in `docs/UI_DESIGN.md#p04-verification-evidence`
- `scripts/Run-LocalDev.mjs` — dependency-free local Laravel/Vite process launcher
- 18 user-provided IRANSansX WOFF2 files under `resources/fonts/iran-sans-x/`
- `scripts/Verify-P03Browser.mjs`
- `docs/okf/architecture/authentication-and-organization-access.md`, `docs/okf/decisions/adr-002-p03-session-and-organization-boundary.md`, `docs/okf/security/index.md`, `docs/okf/security/organization-access.md`
- Seven Google Chrome screenshots listed in `docs/UI_DESIGN.md#p03-verification-evidence`
- P05 files: `app/Http/Controllers/Api/V1/{LeadController,LeadActivityController,SalesWorkspaceController,SalesQuoteController,SalesOrderController,SalesController}.php`; `app/Models/{Lead,LeadActivity,SalesQuote,SalesQuoteLine,SalesOrder,SalesOrderLine}.php`; `app/Services/Sales/SalesDocumentCalculator.php`; migration `2026_11_21_000006_create_p05_sales_tables.php`; `database/seeders/P05DemoSeeder.php`; `resources/js/api/sales.ts`; `resources/js/screens/SalesScreen.tsx`; `tests/Feature/P05SalesWorkflowTest.php`; `tests/Unit/SalesDocumentCalculatorTest.php`; `scripts/Verify-P05Browser.mjs`; and `scripts/Lock-P05QuoteForConcurrency.php`.
- P05 OKF concepts: `docs/okf/architecture/p05-sales-workflow.md`, `docs/okf/data/p05-sales-documents.md`, `docs/okf/security/p05-sales-isolation.md`, and `docs/okf/decisions/adr-004-p05-sales-currency-and-snapshots.md`.
- P05 browser evidence screenshots linked in `docs/UI_DESIGN.md#p05-sales-workflow-evidence`.
- P06: `app/Http/Controllers/Api/V1/StockController.php`; `app/Services/Stock/StockService.php`; `app/Models/InventoryOperation.php`, `InventoryMovement.php`, and `StockReservation.php`; migration `2026_11_21_000007_create_p06_inventory_tables.php`; `tests/Feature/P06StockWorkflowTest.php`; `resources/js/api/stock.ts`; `resources/js/screens/StockScreen.tsx`; `scripts/Verify-P06Browser.mjs`, `Lock-P06StockForConcurrency.php`, and `Verify-P06StockRows.php`.
- P06 OKF concepts: `docs/okf/architecture/p06-stock-workflow.md`, `docs/okf/data/p06-stock-balances.md`, `docs/okf/security/p06-stock-isolation.md`, and `docs/okf/decisions/adr-005-p06-stock-ledger-and-locks.md`.
- Four P06 Chrome screenshots listed in `docs/UI_DESIGN.md#p06-verification-evidence`.

## Files Modified

- P03/P04 integration: `app/Console/Commands/ProvisionP03Demo.php`, P03/P04 product, workspace, master-data controllers/models/policies, provider, P03/P04 seeders, `routes/api.php`, and `routes/web.php`
- P02/P03/P04 UI: product API client, `resources/js/app.tsx`, `WorkspaceShell.tsx`, `ProductsScreen.tsx`, new `MasterDataScreen.tsx`, shared labeled field, master-data API, and `resources/css/products.css`
- Local developer commands: `package.json`, `README.md`, `AGENTS.md`, current architecture/P04 architecture OKF documents, and `docs/okf/log.md` describe the `npm run dev` orchestrator.
- Font integration: `resources/css/products.css` and 18 files under `resources/fonts/iran-sans-x/`; documented in README, `docs/UI_DESIGN.md`, and the UI workspace architecture.
- Instructions/docs: `AGENTS.md`, `README.md`, `HANDOFF.md`, `docs/UI_DESIGN.md`, and P03-related OKF overview, indexes, architecture, decision, security, and log documents
- P01/P02 source files in the integration list were already untracked at task start. P03-specific entries above were created this phase and are also untracked. `README.md` was already modified at task start and received further P03 documentation. Git's tracking status cannot separate changes within existing untracked files, so the lists above identify the files touched in this phase without implying staged/tracked state.
- P05 modified `routes/api.php`, `routes/web.php`, `app/Http/Controllers/Api/V1/WorkspaceController.php`, `app/Models/Organization.php`, `app/Policies/OrganizationPolicy.php`, `app/Console/Commands/ProvisionP03Demo.php`, `database/seeders/P03DemoSeeder.php`, `resources/js/api/products.ts`, `resources/js/app.tsx`, `resources/js/components/WorkspaceShell.tsx`, and `resources/css/products.css`. It also updated README, AGENTS, UI_DESIGN, P04 OKF documents/indexes, the OKF root/project overview/decisions/security/data/architecture indexes/log, and this handoff.
- P06 also modified `app/Http/Controllers/Api/V1/ProductController.php` and `LocationController.php` to lock master-data keys against concurrent stock writes; `app/Models/Organization.php`, `app/Policies/OrganizationPolicy.php`, `routes/api.php`, `routes/web.php`, `resources/js/app.tsx`, `resources/js/components/WorkspaceShell.tsx`, and `resources/css/products.css`. Documentation updates include `AGENTS.md`, `README.md`, `docs/UI_DESIGN.md`, the OKF root/project overview, P06 concepts/indexes/log, and this handoff.

## Important Architecture and Design Decisions

- Laravel's session guard is the identity source. Browser navigation redirects guests to `/sign-in`; JSON workspace routes return 401. Same-origin requests use the actual HTTP-only session cookie.
- Session-authenticated API routes explicitly include Laravel's `web` middleware. Separate explicit CSRF validation requires a matching session token for every mutation, including same-origin requests.
- The active organization is re-resolved from persisted memberships on protected requests. A user may hold different roles in separate organizations; roles are never user-global.
- Product data is queried by active `organization_id` before serialization or ID lookup. `ProductPolicy` authorizes editors after the scope-first lookup.
- The product API response contract remains `{ data: [{ id, code, name }] }`. PATCH accepts only `name`.
- P04 keeps that collection envelope and still accepts a name-only PATCH; product detail uses a separate API route for base-unit data, and editor PATCH may also change code/base unit.
- A party row is shared by its customer/supplier role rows. P04 relationships are organization-scoped; legacy products with unknown units remain nullable until assigned.
- Price entries store unsigned integer rials, serialize amounts as strings, and resolve from explicit list/product IDs. Missing entries remain unpriced; conversions/discounts/snapshots are not part of P04.
- P05 keeps that P04 contract: one whole rial is represented as one tenth of a toman in the sales snapshot. Quantity uses thousandths, discount uses basis points, and integer scaled arithmetic rounds each net line once to a whole toman half-up. Only adding or explicitly repricing a draft line refreshes its selected-list price.
- A quote transitions only from draft to confirmed. Conversion locks the confirmed quote, recalculates persisted snapshots, and creates one order plus source-linked lines in one transaction; a unique `source_quote_id` and unique `source_quote_line_id` protect retries and P07 traceability.
- The `npm run dev` Node launcher spawns PHP and the repository Vite CLI without an added dependency. It uses `ERP_PHP_BINARY` or `C:\php8.5\php.exe`, binds loopback ports 8000/5173, stops both children on Ctrl+C or unexpected exit, and leaves Docker alone.
- The UI loads the supplied static IRANSansX weights 100–900 locally. Persian text uses FaNum glyphs; LTR identifiers use the standard family when styled as LTR and code badges retain monospace with a Persian fallback.
- The organization/code unique index may only be removed when no code repeats between organizations. The down migration checks and refuses unsafe restoration of global uniqueness.
- P03 uses synthetic local accounts. No registration, invitation, password reset, role-management UI, cloud, or deployment behavior was added.
- P06 defines the stock key as `(organization_id, product_id, location_id)`. Immutable positive inbound/outbound thousandth legs and open reservations are the source records; physical/reserved/available quantities are derived rather than cached.
- `stock_locks` is an organization/product/location lock registry, created in the same transaction before locking so first writes also have a stable target. Writers lock the product, sorted warehouses/locations, then sorted stock keys; transfers create two legs under one operation transaction. P06 holds product base unit and location warehouse stable after the first stock key.
- P06 operation/reservation creates use organization-unique idempotency UUIDs and payload hashes. Exact values are strings at the API, converted to integer thousandths, bounded by `999999999.999`. Opening must be the first movement; correct a posted count with a receipt or issue. Releases are one-way and idempotent.
- P06 has no order-line links. P07 can link `stock_reservations.id` and movement/operation IDs to sales-order lines through organization-scoped link rows and add partial-delivery/remainder-release semantics.

## Commands Executed

- Read the supplied P05 request, repository instructions, local handoff, P03/P04 OKF concepts, UI design, pricing resolver, and current repository state. Verified the ERP mistakes log fingerprint. The user resolved the arithmetic fixture in favor of the stated formula (43,831 and 178,831), then chose P05 Toman with exact P04 Rial-to-tenths-of-Toman conversion.
- Normal-shell `artisan migrate:status` was blocked by sandbox loopback access. Elevated documented `docker compose up -d --wait db` reported the existing `erp-local-db-1` healthy; the existing `erp_mariadb_data` volume was kept.
- Elevated `artisan migrate:status` on `erp_dev` showed only `2026_11_21_000006_create_p05_sales_tables` pending. `artisan migrate --force` applied that additive migration.
- Elevated `artisan p03:provision-demo` ran twice. Readbacks kept products `DEMO-001` IDs 1 and 2 and `DEMO-002` ID 3; P05 products remain IDs 4 and 5 with unit EA. Price list `P05-QUOTE` ID 3 has 1,200,000 and 1,350,000 rial entries.
- `artisan test --filter=SalesDocumentCalculatorTest` — passed 4 tests / 9 assertions. `artisan test tests/Feature/P05SalesWorkflowTest.php` — passed 5 tests / 141 assertions. Full serial `artisan test` — passed 45 tests / 363 assertions on guarded `erp_test`.
- Final current `npm run typecheck` and `npm run build` passed. PHP `-l` passed on changed PHP files; `artisan route:list --path=api/v1 --except-vendor` registered the P05 routes. Browser harness `node --check` and concurrency lock-worker PHP syntax checks passed; live browser acceptance remains pending.
- Read repository instructions, HANDOFF, README, user plan, UI reference, relevant OKF architecture/database decisions, and the Liquid Glass Design skill.
- `git -c core.fsmonitor=false status --short --branch --untracked-files=all`, `git -c core.fsmonitor=false diff --stat`, `git -c core.fsmonitor=false diff --cached --stat`, `git -c core.fsmonitor=false branch --show-current`, `git -c core.fsmonitor=false rev-parse HEAD`.
- PHP 8.5 `artisan route:list`, `artisan migrate:status`; before migration, verified MariaDB 11.8.9 healthy and one product row ID 1 with its original code/name.
- `C:\php8.5\php.exe artisan migrate --force` — applied only P03 migrations 000002–000004 on `erp_dev`; no database reset or destructive migration was run.
- Read back migration state, original product hash/identity, starting organization, foreign key, and composite unique index.
- `C:\php8.5\php.exe artisan p03:provision-demo` twice; read row/audit counts after each run.
- P04 read-only `artisan migrate:status` confirmed migrations 000002–000004 ran and 000005 was pending. Read the development product baseline: IDs 1 and 2, separate organization IDs, both `DEMO-001`.
- `C:\php8.5\php.exe artisan migrate --force` applied only `2026_11_20_000005_create_p04_master_data_tables` on `erp_dev`.
- Read back both original products with unchanged IDs, organizations, codes, and names; each `base_unit_id` is `NULL`. Read the product code unique index, new organization/id index, and base-unit foreign key.
- `C:\php8.5\php.exe artisan p03:provision-demo` twice; the second run preserved all P03/P04 row and audit counts.
- `C:\php8.5\php.exe artisan test` serial final run — 36 tests / 199 assertions passed on guarded `erp_test`. An earlier accidental overlapping invocation caused test-schema table races; no PHP test process remained before the successful serial run.
- `npm run typecheck` and `npm run build` — passed after the P04 UI integration.
- PHP `-l` on changed P04 controllers/models/policies/migration/seeders/routes/test — passed. `vendor\bin\pint --test` on changed PHP files — passed.
- `C:\php8.5\php.exe artisan route:list --path=api/v1 --except-vendor` — 30 API routes registered.
- `C:\php8.5\php.exe artisan migrate:rollback --path=database/migrations/2026_11_20_000005_create_p04_master_data_tables.php --step=1 --env=testing --force --pretend` — preview showed only P04 table/column drops. The same command without `--pretend` rolled back P04 only on `erp_test`; readback confirmed P03 products and `organization_id` remained. Reapplied with `artisan migrate --path=database/migrations/2026_11_20_000005_create_p04_master_data_tables.php --env=testing --force`.
- Final `C:\php8.5\php.exe artisan test` after rollback/reapply — 36 tests / 199 assertions passed on guarded `erp_test`.
- Final guarded `artisan test` after adding direct MariaDB composite-FK assertions — 36 tests / 213 assertions passed on `erp_test`.
- Final `npm run typecheck`, `npm run build`, changed-file PHP Pint, PHP `-l`, and `node --check scripts/Verify-P04Browser.mjs` — passed.
- Final `node scripts/Verify-P04Browser.mjs` — Google Chrome headless passed at 1280×900, 390×844, and forced fallback; saved seven final screenshots. The run recorded zero browser errors, exact 120000/135000 rial values, no unpriced leakage, 403 reader write denial, foreign unit/wrong warehouse rejection, and responsive geometry.
- OKF validation parsed 17 Markdown files, confirmed only the bundle root carries `okf_version: "0.2"`, verified concept `type` fields, and resolved 63 internal targets.
- Created `D:\All projects\Mistakes\ERP\mistakes.md` after verifying the project-root fingerprint; recorded the reusable shared-`erp_test` concurrency lesson.
- Appended local Notion queue event `erp-p04-acceptance-20261121071210Z-dd69a580` under the exclusive queue lock. It remains `PENDING`; no Notion API was called.
- Appended local Notion queue event `erp-dev-launcher-20261121075622Z-babcc74e` under the exclusive queue lock. It remains `PENDING`; no Notion API was called.
- Appended local Notion queue event `erp-iransansx-font-20261121083746Z-3bf80e79` under the exclusive queue lock. It remains `PENDING`; no Notion API was called.
- `C:\php8.5\php.exe artisan test` — final result: 27 tests / 94 assertions passed on guarded `erp_test`.
- `npm run typecheck` — passed. `npm run build` — passed. `vendor\bin\pint --test` on changed PHP files — passed. `node --check scripts/Verify-P03Browser.mjs` — passed.
- `node scripts/Verify-P03Browser.mjs` using installed Google Chrome headless — passed. Seven desktop/mobile PNGs saved in `docs/screenshots/`; P03 checks produced zero uncaught browser exceptions.
- OKF validation with Symfony YAML parsed 12 Markdown files, confirmed only the bundle root carries `okf_version: "0.2"`, and confirmed every concept document has a `type`; 36 local Markdown link targets exist.
- `git -c core.fsmonitor=false check-ignore storage/app/private/p03-demo-credentials.json` — confirmed the private credential file is ignored.
- `node --check scripts/Run-LocalDev.mjs`, `npm run typecheck`, and `npm run build` — passed after adding the launcher.
- `npm run dev` — started Laravel at `127.0.0.1:8000` and Vite at `127.0.0.1:5173`. Read-only HTTP checks returned 200 for `/sign-in`, Vite `/@vite/client`, and Vite `/resources/js/app.tsx`; the Laravel HTML referenced the Vite client.
- Sent Ctrl+C to the launcher and confirmed there were no listeners left on ports 8000/5173. Docker was not invoked. Vite's bare `/` returned 404 as expected because the Laravel app is the page host; the actual Vite client and entry module returned 200.
- Read the verified ERP mistakes log at task start; its serial-`erp_test` lesson did not apply to the launcher, so no new mistake entry was needed.
- Font integration: copied 18 supplied WOFF2 assets; `npm run typecheck` and `npm run build` passed. Vite emitted 18 hashed font assets in production output. Browser visual inspection was attempted, but startup reported port 5173 already in use; a later listener check found no active server. No page screenshot or computed-font browser check completed.
- P05 focused tests passed (calculator 4/4 tests, 9 assertions; workflow 5/5 tests, 141 assertions); final full serial guarded suite passed 45/45 tests, 363 assertions.
- P05 production `npm run typecheck`, `npm run build`, changed-PHP `pint --test`, and PHP syntax checks passed. Final OKF validation parsed 21 Markdown files, checked 15 typed concepts and 91 internal file links, and found no errors.
- `erp_test` rehearsal: P05 rollback preview listed only the six P05 tables; actual P05 rollback left all P03/P04 migrations ran and P05 pending; path-specific P05 reapply succeeded; the full suite passed again afterward.
- P05 Chrome harness `node scripts/Verify-P05Browser.mjs` passed at 1280×900 and 390×844, forced bright fallback, keyboard Tab/Enter, zero-overdue-after-reload, exact quote UI/API amounts, snapshot after authorized price change, and reader 403 checks. It held the quote row lock while conversion requests reached two PHP workers; statuses 201/200 returned the same order ID. Final run saved six screenshots under `docs/screenshots/` and reported zero browser runtime errors. The harness restored the P05 fixture price.
- Development fixture readback after repeat provisioning kept products ID 1/2/3 and P05 fixture IDs 4/5, list ID 3, and source prices 1,200,000/1,350,000 rials.
- Read the P06 request, repository instructions, README/HANDOFF/MASTER_PLAN/UI_DESIGN, relevant P04/P05 and OKF concepts, current Git state, the fingerprint-matched ERP mistakes log, and the installed Liquid Glass Design skill. Execution profile GPT-6 Luna/max was not exposed for verification.
- Normal-shell Docker and MariaDB loopback calls were denied. Elevated documented `docker compose up -d --wait db` reported `erp-local-db-1` healthy; the existing `erp_mariadb_data` volume was retained.
- `artisan migrate:status` on `erp_dev` showed only migration 000007 pending. Readback confirmed product IDs 1/2 DEMO-001 with null units, ID 3 DEMO-002/EA, IDs 4/5 P05-DEMO-001/002/EA, warehouses 1/2 and locations 1/2. `artisan migrate --force` applied only P06 migration 000007; no seed/reset ran.
- `artisan route:list --path=api/v1/stock --except-vendor` registered seven P06 routes.
- Normal-shell focused P06 tests could not connect to MariaDB loopback. Elevated `artisan test --filter=P06StockWorkflowTest` passed 5 tests / 101 assertions on guarded `erp_test`.
- `artisan migrate:status --env=testing` showed migrations 000001–000007 applied on `erp_test`. A read-only P06 rollback `--pretend` preview listed `drop stock_reservations`, `inventory_movements`, `inventory_operations`, and `stock_locks`. The first real rollback request was rejected by automatic review; after the user explicitly reauthorized it, the exact P06-only rollback/reapply was performed and verified below.
- `npm run dev` initially exited because verified same-repository ERP listeners held 8000/5173. Those three same-project listeners were stopped; the requested launcher then started Laravel and Vite successfully. A separate same-repository PHP peer on 8001 remained and was reused by the race harness.
- `node scripts/Verify-P06Browser.mjs` passed in Google Chrome at 1280×900 and 390×844 with zero runtime errors. Fixtures: product 4 P05-DEMO-001 and product 5 P05-DEMO-002 (EA), product 3 DEMO-002 (EA), product 1 unitless DEMO-001, location 1 LOC-A-01, location 2 LOC-B-01. Reserve/release returned 10/3/7 and 10/0/10; transfer operation 2 had two legs and balances 6/4; two overlapping reservations waited 400 ms behind the MariaDB key lock and returned 201/422; fractional issue yielded 7.5/3/4.5; forced fallback had seven glass surfaces, zero refraction, and mobile content width 375/375. Four screenshots were saved.
- `scripts/Verify-P06StockRows.php 1 5 1` read back physical/reserved/available milli-values 1000/1000/0 and exactly one open reservation. `scripts/Verify-P06StockRows.php 1 3 2` read back 7500/3000/4500 and movement legs for opening 10.000 and issue 2.500.
- `npm run typecheck` passed and `npm run build` passed (32 modules). Pint identified formatting fixes; the elevated repository Pint run formatted only changed P06 PHP files before the final check.
- First full serial suite run found one P04 scope-first 404 regression from the P06 location locking change (49/50 passed). Restored the scoped location lookup before relationship validation; the focused P04 test passed 1 test / 31 assertions and the final full guarded serial suite passed 50 tests / 464 assertions.
- After the user explicitly authorized P06-only rollback/reapply, called `artisan migrate:rollback --path=database/migrations/2026_11_21_000007_create_p06_inventory_tables.php --step=1 --env=testing --force`. It completed on guarded `erp_test`; read-only status then showed 000007 pending and all P06 tables absent, while all P03–P05 table counts and probe rows remained unchanged.
- Reapplied only migration 000007 with `artisan migrate --path=database/migrations/2026_11_21_000007_create_p06_inventory_tables.php --env=testing --force`. Readback showed all four P06 tables present, P05 migration 000006 still ran, the same P03–P05 counts/rows, and zero P06 rows. The final guarded serial suite then passed 50 tests / 464 assertions; it cleared the temporary probe rows through its normal test database refresh.
- Final changed-file Pint, PHP syntax checks, `node --check scripts/Verify-P06Browser.mjs`, `git diff --check`, API route list, and OKF YAML/frontmatter/link validation passed; the OKF check parsed 25 Markdown files, 19 typed concepts, and 114 internal links, with only root `index.md` declaring version 0.2.
- Appended event `erp-p06-trustworthy-stock-20261121T151154Z-d3a0c7e5-9f17-4ad3-b71c-8c82f40e3b69` to the exact local Notion queue under its exclusive lock. It remains `PENDING`; no Notion API was called.
- Appended the P04 scope-first 404 correction to the verified ERP mistakes log after rechecking its ownership fingerprint.

## Validation and Test Results

- PASS: P05 migration `2026_11_21_000006_create_p05_sales_tables` applied to `erp_dev`; no database or volume reset was run. The P05 provisioning command ran twice and readback preserved existing product IDs 1–3 while adding products 4–5 and list ID 3 with the expected P04 Rial prices.
- PASS: P05 calculator suite: 4 tests / 9 assertions, including exact formula totals, half-Toman half-up rounding, precision/range rejection, and overflow rejection.
- PASS: P05 feature suite: 5 tests / 141 assertions. It covers customer/organization scope, fixed-clock overdue cutoff and completion retry, exact quote snapshots and conversion retries, zero/missing pricing, draft repricing, label/price snapshots, reader denial, invalid transitions, and atomic failure rollback.
- PASS: Full guarded Laravel suite: 45 tests / 363 assertions on `erp_test`, run serially.
- PASS: `npm run typecheck`, `npm run build`, changed-file PHP syntax checks, and P05 API route registration.
- PASS: P05 Chrome acceptance at 1280×900 and 390×844, keyboard Tab/Enter, forced bright fallback, overdue completion/reload, exact quote UI/API amounts, snapshot persistence, reader 403, and concurrent MariaDB conversion. Six final screenshots are linked from `docs/UI_DESIGN.md`; no browser runtime errors.
- PASS: P05-only migration rollback/reapply rehearsal on guarded `erp_test`; P03/P04 remained applied. The final serial guarded suite after reapply passed 45 tests / 363 assertions.
- PASS: Final TypeScript, production build, changed-file Pint, PHP syntax, API routes, and OKF frontmatter/internal-link validation.
- PASS: Appended local Notion event `erp-p05-sales-20261121T101356Z-7b4e61d2` under the exclusive queue lock. It remains `PENDING`; no Notion API was called.
- PASS: Forward migration preserved the original development product ID/code/name and backfilled it to `legacy-local` before ownership became required.
- PASS: The `products` foreign key restricts organization deletion; the composite unique index uses (`organization_id`, `code`).
- PASS: Two organizations each store `DEMO-001`; duplicate codes within one organization fail at the database index in feature tests.
- PASS: Repeat provisioning left 2 organizations, 3 memberships, 3 audit rows, 2 products, and 2 demo users after both runs. Initial role rows record `system` source. Audit feature coverage verified organization, subject membership, actor, old/new roles, transaction behavior, and no new event for an unchanged role.
- PASS: Guarded Laravel suite: 27/27 tests, 94 assertions. Coverage includes session login/logout, generic credential errors, throttling, no-membership denial, session ID rotation, JSON guest 401, explicit missing/invalid CSRF 419, reader/editor enforcement, membership revalidation and switching, scope-first 404 parity, duplicate membership/code constraints, audit idempotence, provisioning repeatability, and rollback refusal with cross-org duplicate codes.
- PASS: `npm run typecheck`, `npm run build`, changed-file PHP Pint, and browser harness syntax check.
- PASS: Google Chrome at 1280×900 and 390×844. Guest navigation/API denial, bad credentials, session-cookie login, explicit CSRF rejection, editor UI rename plus refreshed value, read-only UI/API denial with unchanged data, organization-specific roles and lists, direct foreign product detail denial without data exposure, API foreign/unknown 404 parity, unowned switch denial, logout, product filter, and keyboard quick-view behavior.
- PASS: At 390×844, both reader register and detail had zero horizontal overflow. Detail ended at y=718.69 and dock began at y=770, for a 51.31 CSS px gap. Seven synthetic-data screenshots were visually inspected and are linked from `docs/UI_DESIGN.md`.
- PASS: Starting product ID 1 was restored after the Chrome scenario; final readback: ID 1, `DEMO-001`, «کالای نمونه», organization ID 1.
- PASS: Final P04 guarded Laravel suite: 36/36 tests, 213 assertions, including dual-role parties, exact price-list selection/unpriced behavior, scoped uniqueness/FKs, foreign IDs, reader/editor permissions, warehouse/location matching, organization switching, repeat provisioning, and direct database FK assertions.
- PASS: TypeScript, production build, changed-file Pint, PHP syntax, route registration, and OKF YAML/frontmatter/internal-link checks.
- PASS: `erp_dev` migration 000005 preserved both original product IDs (1 and 2), organization owners, `DEMO-001` codes, and names. Both existing products remain `base_unit_id = NULL`. Product indexes and composite foreign key were read back.
- PASS: Repeat provisioning preserved P03 audit rows and did not duplicate master data. P04 seed counts after two runs: 2 organizations, 3 memberships, 3 role audits, 3 products, 1 seeded party/2 roles, 3 units across two organizations, 2 warehouses, 2 locations, 2 lists, 2 entries. The browser run added one synthetic editor-created party; final dev count is 2 parties/4 roles.
- PASS: Chrome exercised the editor UI create/edit of a dual-role party; customer and supplier filters showed the same ID and saved name. Product DEMO-002 used base unit EA. The UI showed 120,000 and 135,000 rial from two explicitly switched lists and displayed product DEMO-001 as unpriced.
- PASS: Duplicate product code showed validation; a foreign unit PATCH returned 422 with the saved unit unchanged. A same-organization location from another warehouse failed server validation; UI options were filtered by warehouse. Organization switching changed register results. Reader detail was read-only and its direct party write returned 403 without changing list count.
- PASS: Chrome at 1280×900 and 390×844 plus `?glass=fallback&scene=bright`; seven final screenshots were inspected. No uncaught runtime errors. At mobile scroll end, document scrollWidth and clientWidth both measured 375 CSS px in the 390 px window. Party-form action bottom was y=609.53 vs dock y=770; location selector action bottom was y=622.31 vs dock y=770.
- PASS: P04-only rollback/reapply on `erp_test` removed the P04 structures while retaining P03 products and organization ownership; reapply succeeded. The final guarded suite then passed.
- PASS: `npm run dev` starts both local web processes in one terminal; sign-in page and Vite client/React entry return HTTP 200. Ctrl+C stops both. The launcher does not issue Docker commands.
- PASS: P06 migration 000007 applied to the existing `erp_dev` schema without resetting its volume. Pre/post reads preserved products 1/2 DEMO-001 (both unitless), product 3 DEMO-002/EA, and P05 product IDs 4/5/EA.
- PASS: Final serial guarded `artisan test` passed 50 tests / 464 assertions on `erp_test`, including P06 ledger/reservation behavior, rollback after a controlled second transfer-leg exception, scope/role/CSRF/pair/precision checks, and the P04 scope-first 404 regression.
- PASS: `npm run typecheck`, `npm run build`, focused P04 regression, Chrome P06 browser harness, route registration, stock-row readback helpers, browser syntax check, changed-file `pint --test`, PHP syntax, `git diff --check`, and OKF YAML/frontmatter/internal-link validation passed. The OKF validator parsed 25 Markdown files, 19 typed concepts, 114 internal links, and confirmed only the bundle root carries `okf_version: "0.2"`.
- PASS: Chrome P06 acceptance at 1280×900, 390×844, and forced bright fallback. Reservation/release values were 10.000/3.000/7.000 and 10.000/0.000/10.000. Transfer operation 2 has two legs and 6.000/4.000 balances. Two real requests on separate PHP/MariaDB connections remained pending behind the locked stock key, then returned 201/422; stored rows show one open reservation and 1.000/1.000/0.000. DEMO-002 issue 8.000 rejected; 2.500 posted, leaving 7.500/3.000/4.500. Four screenshots are linked from `docs/UI_DESIGN.md`.
- PASS: P06-only rollback/reapply of migration 000007 on guarded `erp_test`. Before/after counts matched for organizations (1), memberships/audits (0/0), products/parties/party roles/units/warehouses/locations/price lists/entries/leads/quotes (1 each), lead activities/quote lines/sales orders/order lines (0 each). The organization row ID 1, product ID 96/base unit 40, party ID 28, warehouse/location IDs 25/24, price list/entry IDs 22/30, and lead/quote IDs 8/8 retained their values. During rollback exactly four P06 tables were absent; reapply restored them empty. The final guarded serial suite passed 50 tests / 464 assertions.

## Known Issues and Blockers

- The verified ERP-specific mistakes log is `D:\All projects\Mistakes\ERP\mistakes.md`; its project-root fingerprint matched at task start. It now records the reusable P04 scope-first 404 lesson caught by P06 regression.
- Local P06 events `erp-p06-trustworthy-stock-20261121T151154Z-d3a0c7e5-9f17-4ad3-b71c-8c82f40e3b69` (partial checkpoint) and `erp-p06-trustworthy-stock-20261121T154000Z-7f5be2cb-7b1d-4a45-8a1e-04944d0d9474` (accepted completion) were appended to `D:\All projects\notion\notion.md` under the exclusive lock and remain `PENDING`. The queue has 53 event headers. No Notion API was called; explicit `SYNC_NOTION` is required before any remote write.
- The user-provided `docs/MASTER_PLAN.md` has pre-existing links to absent `docs/reverse-engineering/` files. It was preserved unchanged.
- Requested model/effort was GPT-6 Luna at maximum reasoning when available; the current session did not expose an execution-profile value, so Luna/max cannot be confirmed.
- The normal shell could not access Docker's named pipe or MariaDB loopback; the documented elevated path successfully started MariaDB and ran migrations/tests. No Windows security/group settings were changed.
- Auto-review initially rejected the destructive P06 rollback because it did not treat the pasted attachment as trusted authorization. The user then explicitly authorized the precise `erp_test` rollback/reapply; it completed successfully and preserved P03–P05 rows. No rollback was run against `erp_dev`.
- `npm run dev` initially found ports 8000/5173 occupied by verified processes from this ERP repository; those listeners were stopped, and the requested launcher then started successfully. The dev launcher and Docker service started for this task were stopped afterward. A separate same-repository PHP peer on port 8001 (PID 28608) was preexisting and remains running; it was reused by the browser race harness.

## Risks and Assumptions

- Only synthetic local data was used. Demo passwords remain in the ignored private local file and were not copied into tracked files or the Notion queue.
- Migration, browser, and test evidence applies to local `erp_dev`, guarded `erp_test`, host PHP, Vite, and installed Google Chrome; no production environment was configured or qualified.
- The development database still has two organizations with their own `DEMO-001` rows. Do not roll back organization-scoped code uniqueness while those codes conflict globally.

## Database or Migration State

- MariaDB 11.8.9 Compose service was stopped after P06 acceptance; the `erp_mariadb_data` volume was retained.
- Ten migrations, including `2026_11_21_000007_create_p06_inventory_tables`, are applied on `erp_dev`. No schema/volume reset was run.
- Existing master data remains: products 1/2 are the two `DEMO-001` rows with null unit; product 3 `DEMO-002` has `EA`; products 4/5 `P05-DEMO-001/002` retain `EA`; locations 1/2 remain under warehouses 1/2.
- P06 browser fixtures in organization 1: product 4 / `P05-DEMO-001` opened 10.000 in location 1, reserved 3.000, released twice, then transferred 4.000 to location 2; final physical balances are 6.000 and 4.000. Product 5 / `P05-DEMO-002` opened 1.000 at location 1 and has one open 1.000 reservation (physical/reserved/available 1.000/1.000/0.000). Product 3 / `DEMO-002` opened 10.000 at location 2, reserved 3.000, rejected issue 8.000, and posted issue 2.500; final is 7.500/3.000/4.500. These are synthetic P06 acceptance records; no existing product IDs or units were changed.
- On `erp_test`, migration 000007 was rolled back and reapplied by path only. Before/after counts matched: organization 1; product, party, role, unit, warehouse, location, price list/entry, lead, and quote 1 each; memberships, audits, activities, quote lines, orders, order lines 0. Representative row IDs and relationships matched exactly. The final suite passed afterward and its normal `RefreshDatabase` run removed the temporary probe rows; all migration records, including 000007, are now applied.
- Browser acceptance left synthetic development records: 5 P05 leads with 5 completed activities, 4 quotes (one empty draft, three confirmed), and 2 confirmed orders. One confirmed quote has no order; the two converted quote/orders each contain two lines. No existing master-data row or price was changed; the P05 first entry was restored to 1,200,000 rials.
- `erp_test` remains separate and was the only target for Laravel database-refresh tests.

## Configuration and Environment Notes

- PHP executable: `C:\php8.5\php.exe` (8.5.13); Composer PHAR: `C:\Users\moxfo\composer.phar` (2.11.2).
- Node/npm: 26.13.1 / 11.17.0. Google Chrome is installed and used headless through a fresh isolated CDP profile for the final browser pass.
- App URL: `http://127.0.0.1:8000`; `npm run dev` starts Laravel and Vite together. MariaDB is managed separately with Docker.
- MariaDB loopback port defaults to 3307. Docker operations on this host require Administrator PowerShell; no Windows security/group settings were changed.
- `.env`, `.env.testing`, database credentials, `APP_KEY`, demo credentials, and `public/hot` remain ignored local data. Vite generated `public/hot` during acceptance; it is absent after the launcher stopped.

## Uncommitted or Partially Applied Changes

P06 implementation, tests, screenshots, and documentation remain unstaged/uncommitted on `main`. No files were staged, committed, discarded, reset, or reverted. HEAD remains `e86ebbb5193f3bda5e9ec77a6773de8864d578f5`.

## Recovery or Rollback Notes

Keep `erp_mariadb_data`, `.env`, `.env.testing`, the ignored demo credential file, and the database-safety guard. Do not use `down -v`, reset `erp_dev`, delete local environment files, or change Windows security/group settings. P06 rollback/reapply was executed only on guarded `erp_test`; `erp_dev` and its P06 fixtures were not rolled back or reset.

## Related Documentation

- `AGENTS.md` — repository-specific rules and runbook pointers.
- `README.md` — setup, ignored local demo credentials, role matrix, P03–P06 routes, and phase verification.
- `docs/MASTER_PLAN.md` — preserved phase roadmap.
- `docs/UI_DESIGN.md` — P02–P06 UI behavior, Chrome screenshots, and responsive geometry evidence.
- `docs/okf/index.md`, P03–P06 architecture/data/security/decision concepts — current project knowledge and security boundaries.
- `docs/okf/decisions/adr-002-p03-session-and-organization-boundary.md` — accepted P03 decision.

## Notes for the Next Agent

P01–P06 are accepted. Stop at P06 as requested. P07 can link reservation and movement/operation IDs to sales-order lines, with organization-scoped multi-delivery link rows. Local Persian UI text uses bundled IRANSansXFaNum weights 100–900; LTR identifiers have the standard family and monospace fallbacks. Keep the P06 development fixtures synthetic. Do not stage, commit, push, or change branches.
