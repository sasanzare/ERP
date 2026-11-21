# Project Handoff

## Last Updated

2026-11-21

## Project Summary

Local-development-only ERP prototype. P01 product API, P02 Persian RTL workspace, P03 session-authenticated organization access, and P04 shared master data are accepted. Runtime data is synthetic and stored in local MariaDB.

## Current Objective

P04 is accepted. IranSansX has been added to the Persian UI with matching static weights. Await the next requested task.

## Current Phase or Milestone

P01–P04 ACCEPTED. IranSansX integration is complete: standard and FaNum WOFF2 files for nine weights are bundled; Persian UI uses FaNum. Build and TypeScript checks passed.

## Repository State

- Repository path: `D:\All projects\ERP`
- Current branch: `main`
- Base or starting commit: `b97e66bd343c0f81702d939840f009783265f12f`
- Current HEAD: `b97e66bd343c0f81702d939840f009783265f12f`
- Working tree status: six tracked font/documentation edits and 18 untracked WOFF2 assets. P04/launcher changes were committed at the starting HEAD.
- Staged changes: none
- Unstaged changes: `HANDOFF.md`, `README.md`, `docs/UI_DESIGN.md`, `docs/okf/architecture/ui-workspace.md`, `docs/okf/log.md`, and `resources/css/products.css`.
- Untracked files: 18 IranSansX WOFF2 weights in `resources/fonts/iran-sans-x/`.

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

## Work in Progress

None. Font assets and weight mappings are integrated; build and typecheck pass. Existing P04/launcher changes remain uncommitted.

## Remaining Work

No font work remains. P05 is unstarted and requires a separate user request.

## Exact Next Steps

No implementation work remains. An optional browser visual review may be repeated when the local dev server is available. Do not stage, commit, push, or change branches.

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

## Files Modified

- P03/P04 integration: `app/Console/Commands/ProvisionP03Demo.php`, P03/P04 product, workspace, master-data controllers/models/policies, provider, P03/P04 seeders, `routes/api.php`, and `routes/web.php`
- P02/P03/P04 UI: product API client, `resources/js/app.tsx`, `WorkspaceShell.tsx`, `ProductsScreen.tsx`, new `MasterDataScreen.tsx`, shared labeled field, master-data API, and `resources/css/products.css`
- Local developer commands: `package.json`, `README.md`, `AGENTS.md`, current architecture/P04 architecture OKF documents, and `docs/okf/log.md` describe the `npm run dev` orchestrator.
- Font integration: `resources/css/products.css` and 18 files under `resources/fonts/iran-sans-x/`; documented in README, `docs/UI_DESIGN.md`, and the UI workspace architecture.
- Instructions/docs: `AGENTS.md`, `README.md`, `HANDOFF.md`, `docs/UI_DESIGN.md`, and P03-related OKF overview, indexes, architecture, decision, security, and log documents
- P01/P02 source files in the integration list were already untracked at task start. P03-specific entries above were created this phase and are also untracked. `README.md` was already modified at task start and received further P03 documentation. Git's tracking status cannot separate changes within existing untracked files, so the lists above identify the files touched in this phase without implying staged/tracked state.

## Important Architecture and Design Decisions

- Laravel's session guard is the identity source. Browser navigation redirects guests to `/sign-in`; JSON workspace routes return 401. Same-origin requests use the actual HTTP-only session cookie.
- Session-authenticated API routes explicitly include Laravel's `web` middleware. Separate explicit CSRF validation requires a matching session token for every mutation, including same-origin requests.
- The active organization is re-resolved from persisted memberships on protected requests. A user may hold different roles in separate organizations; roles are never user-global.
- Product data is queried by active `organization_id` before serialization or ID lookup. `ProductPolicy` authorizes editors after the scope-first lookup.
- The product API response contract remains `{ data: [{ id, code, name }] }`. PATCH accepts only `name`.
- P04 keeps that collection envelope and still accepts a name-only PATCH; product detail uses a separate API route for base-unit data, and editor PATCH may also change code/base unit.
- A party row is shared by its customer/supplier role rows. P04 relationships are organization-scoped; legacy products with unknown units remain nullable until assigned.
- Price entries store unsigned integer rials, serialize amounts as strings, and resolve from explicit list/product IDs. Missing entries remain unpriced; conversions/discounts/snapshots are not part of P04.
- The `npm run dev` Node launcher spawns PHP and the repository Vite CLI without an added dependency. It uses `ERP_PHP_BINARY` or `C:\php8.5\php.exe`, binds loopback ports 8000/5173, stops both children on Ctrl+C or unexpected exit, and leaves Docker alone.
- The UI loads the supplied static IRANSansX weights 100–900 locally. Persian text uses FaNum glyphs; LTR identifiers use the standard family when styled as LTR and code badges retain monospace with a Persian fallback.
- The organization/code unique index may only be removed when no code repeats between organizations. The down migration checks and refuses unsafe restoration of global uniqueness.
- P03 uses synthetic local accounts. No registration, invitation, password reset, role-management UI, cloud, or deployment behavior was added.

## Commands Executed

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

## Validation and Test Results

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

## Known Issues and Blockers

- The project-specific mistakes log is available at `D:\All projects\Mistakes\ERP\mistakes.md`; its fingerprint was verified and one reusable concurrency note was added.
- Three ERP report-only events were appended to `D:\All projects\notion\notion.md`; each is `PENDING` with zero entity changes (45 queue events total). Existing records were preserved. No Notion API was called; explicit `SYNC_NOTION` is still required before any remote write.
- The user-provided `docs/MASTER_PLAN.md` has pre-existing links to absent `docs/reverse-engineering/` files. It was preserved unchanged; this does not block P04.
- Requested model/effort was GPT-6 Luna at maximum reasoning when available; the current session did not expose an execution-profile value, so Luna/max cannot be confirmed.
- An early overlapping double invocation of `artisan test` produced `erp_test` table races; the final serial suite passed 36/36 tests and 213 assertions. The correction is recorded in `AGENTS.md` and the ERP-specific mistakes log.
- The Vite watcher reported `EBUSY` while observing temporary Chrome profile files, but Chrome acceptance finished with zero application runtime errors. Laravel and Vite servers were stopped afterward. The pre-existing `public/hot` file still points to the documented Vite dev URL; start `npm run dev` before opening the local app.
- The local web servers are stopped after launcher verification; MariaDB/Docker remains a manual user-managed prerequisite. `npm run dev` itself must not be run as Administrator unless the user's environment specifically requires it.

## Risks and Assumptions

- Only synthetic local data is used. Demo passwords remain in the ignored private local file; the editor credential was shared in chat only after the user explicitly requested it and was not copied into tracked files or the Notion queue.
- Local migration, browser, and test evidence applies to the inspected `erp_dev`, isolated `erp_test`, Windows host PHP, Vite, and installed Google Chrome; no production environment was configured or qualified.
- The development database intentionally now has two organizations and two rows sharing `DEMO-001`. Removing the organization-scoped uniqueness migration will be refused until those codes no longer conflict globally.

## Database or Migration State

- MariaDB 11.8.9 Compose service is healthy. The existing `erp_mariadb_data` volume was retained.
- All eight migrations are applied; P03 migration batch is 2 and P04 migration batch is 3. The development schema and `erp_mariadb_data` volume were not reset.
- After Chrome acceptance: `organizations` 2; `organization_memberships` 3; `organization_role_audits` 3; `products` 3; `parties` 2; `party_roles` 4; `units` 3; `warehouses` 2; `locations` 2; `price_lists` 2; `price_list_entries` 2.
- Product ID 1 remains `DEMO-001`, «کالای نمونه», `organization_id=1`; product ID 2 remains the organization B `DEMO-001`. Both still have unknown base unit (`NULL`). P04 added `DEMO-002` with unit `EA` and exact 120000/135000 rial entries for the two sample lists.
- `erp_test` remains separate and was the only target for Laravel database-refresh tests.

## Configuration and Environment Notes

- PHP executable: `C:\php8.5\php.exe` (8.5.13); Composer PHAR: `C:\Users\moxfo\composer.phar` (2.11.2).
- Node/npm: 26.13.1 / 11.17.0. Google Chrome is installed and used headless through a fresh isolated CDP profile for the final browser pass.
- App URL: `http://127.0.0.1:8000`; run `npm run dev` from the repository root to start Laravel and Vite together. There are no active listeners after verification. Start MariaDB separately with Docker before using database-backed pages.
- MariaDB loopback port defaults to 3307. Docker operations on this host require Administrator PowerShell; no Windows security/group settings were changed.
- `.env`, `.env.testing`, database credentials, `APP_KEY`, and P03 demo credentials remain ignored local data. Laravel/Vite servers were stopped after Chrome verification; the pre-existing `public/hot` file still points to Vite at 5173, so start `npm run dev` when reopening the UI.

## Uncommitted or Partially Applied Changes

Only the font integration remains uncommitted on `main`: six tracked edits and 18 WOFF2 assets. Nothing was staged, committed, discarded, or reset. P04/launcher were committed at starting HEAD `b97e66bd343c0f81702d939840f009783265f12f`.

## Recovery or Rollback Notes

Keep `erp_mariadb_data`, `.env`, `.env.testing`, the ignored P03 credential file, and the database-safety guard. Do not use `down -v`, reset `erp_dev`, delete local environment files, or change Windows security/group settings. The migration that restores global product-code uniqueness refuses rollback while different organizations share a code; first reconcile/rename duplicate codes before considering that rollback. User-owned source and plan files remain intact.

## Related Documentation

- `AGENTS.md` — repository-specific rules and runbook pointers.
- `README.md` — setup, ignored local P03 credentials, role matrix, P03/P04 provisioning, routes, and phase verification.
- `docs/MASTER_PLAN.md` — preserved phase roadmap.
- `docs/UI_DESIGN.md` — P02/P03/P04 UI behavior, Chrome screenshots, and mobile geometry evidence.
- `docs/okf/index.md`, P04 architecture/data/security/decision concepts, and P03 access documents — current project knowledge and security boundary.
- `docs/okf/decisions/adr-002-p03-session-and-organization-boundary.md` — accepted P03 decision.

## Notes for the Next Agent

P01–P04 are accepted. Local Persian UI text uses bundled IRANSansXFaNum weights 100–900; LTR identifiers have the standard family and monospace fallbacks. `npm run dev` starts Laravel and Vite together; the user starts Docker/MariaDB manually. Three report-only queue events are `PENDING`; no Notion API was called. P05 is unstarted; wait for a separate user request. Do not stage, commit, push, or change branches.
