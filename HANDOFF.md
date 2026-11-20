# Project Handoff

## Last Updated

2026-11-20

## Project Summary

Local-development-only ERP prototype. P01 product API, P02 Persian RTL workspace, and P03 session-authenticated organization access are accepted. Runtime data is synthetic and stored in local MariaDB.

## Current Objective

P03 is complete. Continue only when the user requests the next project phase; P04 is the next phase in `docs/MASTER_PLAN.md`.

## Current Phase or Milestone

P03 ACCEPTED. Sign-in/out, explicit CSRF enforcement, organization memberships, per-membership reader/editor permissions, scoped product reads/writes, role audit, repeatable local provisioning, responsive UI, and browser acceptance all passed.

## Repository State

- Repository path: `D:\All projects\ERP`
- Current branch: `main`
- Base or starting commit: `e961d1837fbe0125a2d3878c4bc0fca6faf9faaf`
- Current HEAD: `e961d1837fbe0125a2d3878c4bc0fca6faf9faaf`
- Working tree status: `README.md` is modified; the existing P01/P02 scaffold and implementation, user-provided plan, and P03 files are untracked relative to the starting commit. See `git -c core.fsmonitor=false status --short --untracked-files=all` for the full inventory. The `README.md` modification and widespread untracked state predate P03 and were preserved.
- Staged changes: none
- Unstaged changes: modified `README.md`; untracked repository content including P01/P02, P03, and user-provided files
- Untracked files: see the status command above; ignored dependencies/build output and local `.env*`/P03 credentials are not listed

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

## Work in Progress

None.

## Remaining Work

No P03 acceptance work remains. P04 is planned in `docs/MASTER_PLAN.md` and was not started or authorized by this request.

## Exact Next Steps

Wait for the user's P04 request. Do not stage, commit, push, or change branches. Before P04, reread this handoff, current Git status, project instructions, and the P04-relevant OKF docs.

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
- `scripts/Verify-P03Browser.mjs`
- `docs/okf/architecture/authentication-and-organization-access.md`, `docs/okf/decisions/adr-002-p03-session-and-organization-boundary.md`, `docs/okf/security/index.md`, `docs/okf/security/organization-access.md`
- Seven Google Chrome screenshots listed in `docs/UI_DESIGN.md#p03-verification-evidence`

## Files Modified

- P03 integration: `app/Http/Controllers/Api/V1/ProductController.php`, `app/Models/Product.php`, `app/Models/User.php`, `app/Providers/AppServiceProvider.php`, `bootstrap/app.php`, `database/seeders/ProductSeeder.php`, `routes/api.php`, `routes/web.php`, `scripts/Initialize-Local.ps1`, `tests/TestCase.php`, existing feature tests
- P03 UI: `resources/js/api/products.ts`, `resources/js/app.tsx`, `resources/js/components/WorkspaceShell.tsx`, `resources/js/screens/ProductsScreen.tsx`, `resources/css/products.css`, `resources/views/products.blade.php`
- Instructions/docs: `AGENTS.md`, `README.md`, `HANDOFF.md`, `docs/UI_DESIGN.md`, and P03-related OKF overview, indexes, architecture, decision, security, and log documents
- P01/P02 source files in the integration list were already untracked at task start. P03-specific entries above were created this phase and are also untracked. `README.md` was already modified at task start and received further P03 documentation. Git's tracking status cannot separate changes within existing untracked files, so the lists above identify the files touched in this phase without implying staged/tracked state.

## Important Architecture and Design Decisions

- Laravel's session guard is the identity source. Browser navigation redirects guests to `/sign-in`; JSON workspace routes return 401. Same-origin requests use the actual HTTP-only session cookie.
- Session-authenticated API routes explicitly include Laravel's `web` middleware. Separate explicit CSRF validation requires a matching session token for every mutation, including same-origin requests.
- The active organization is re-resolved from persisted memberships on protected requests. A user may hold different roles in separate organizations; roles are never user-global.
- Product data is queried by active `organization_id` before serialization or ID lookup. `ProductPolicy` authorizes editors after the scope-first lookup.
- The product API response contract remains `{ data: [{ id, code, name }] }`. PATCH accepts only `name`.
- The organization/code unique index may only be removed when no code repeats between organizations. The down migration checks and refuses unsafe restoration of global uniqueness.
- P03 uses synthetic local accounts. No registration, invitation, password reset, role-management UI, cloud, or deployment behavior was added.

## Commands Executed

- Read repository instructions, HANDOFF, README, user plan, UI reference, relevant OKF architecture/database decisions, and the Liquid Glass Design skill.
- `git -c core.fsmonitor=false status --short --branch --untracked-files=all`, `git -c core.fsmonitor=false diff --stat`, `git -c core.fsmonitor=false diff --cached --stat`, `git -c core.fsmonitor=false branch --show-current`, `git -c core.fsmonitor=false rev-parse HEAD`.
- PHP 8.5 `artisan route:list`, `artisan migrate:status`; before migration, verified MariaDB 11.8.9 healthy and one product row ID 1 with its original code/name.
- `C:\php8.5\php.exe artisan migrate --force` — applied only P03 migrations 000002–000004 on `erp_dev`; no database reset or destructive migration was run.
- Read back migration state, original product hash/identity, starting organization, foreign key, and composite unique index.
- `C:\php8.5\php.exe artisan p03:provision-demo` twice; read row/audit counts after each run.
- `C:\php8.5\php.exe artisan test` — final result: 27 tests / 94 assertions passed on guarded `erp_test`.
- `npm run typecheck` — passed. `npm run build` — passed. `vendor\bin\pint --test` on changed PHP files — passed. `node --check scripts/Verify-P03Browser.mjs` — passed.
- `node scripts/Verify-P03Browser.mjs` using installed Google Chrome headless — passed. Seven desktop/mobile PNGs saved in `docs/screenshots/`; P03 checks produced zero uncaught browser exceptions.
- OKF validation with Symfony YAML parsed 12 Markdown files, confirmed only the bundle root carries `okf_version: "0.2"`, and confirmed every concept document has a `type`; 36 local Markdown link targets exist.
- `git -c core.fsmonitor=false check-ignore storage/app/private/p03-demo-credentials.json` — confirmed the private credential file is ignored.

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

## Known Issues and Blockers

- `D:\All projects\Mistakes\ERP\mistakes.md` was absent and lies outside the only writable root; it could not be read or created. No substitute log was used.
- `D:\All projects\notion\notion.md` exists outside the writable root but could not be appended safely. No Notion APIs or alternate queue were used. `LOCAL_NOTION_QUEUE: BLOCKED`, zero events appended, cause: workspace-write sandbox allows writes only under `D:\All projects\ERP`.
- The user-provided `docs/MASTER_PLAN.md` has links to absent `docs/reverse-engineering/` files. It was preserved unchanged; this does not block P03.
- Requested model/effort was GPT-6 Luna at maximum reasoning when available; the current session did not expose an execution-profile value, so Luna/max cannot be confirmed.

## Risks and Assumptions

- Only synthetic local data is used. Demo passwords live solely in the ignored private local file and were never printed or placed in tracked files/screenshots/handoff/Notion.
- Local migration, browser, and test evidence applies to the inspected `erp_dev`, isolated `erp_test`, Windows host PHP, Vite, and installed Google Chrome; no production environment was configured or qualified.
- The development database intentionally now has two organizations and two rows sharing `DEMO-001`. Removing the organization-scoped uniqueness migration will be refused until those codes no longer conflict globally.

## Database or Migration State

- MariaDB 11.8.9 Compose service is healthy. The existing `erp_mariadb_data` volume was retained.
- All seven migrations are applied; P03 migration batch is 2. The development schema was not reset.
- `organizations`: 2 rows. `organization_memberships`: 3. `organization_role_audits`: 3. `products`: 2.
- Product ID 1 remains `DEMO-001`, «کالای نمونه», `organization_id=1` (`legacy-local`). Both organizations have one `DEMO-001`.
- `erp_test` remains separate and was the only target for Laravel database-refresh tests.

## Configuration and Environment Notes

- PHP executable: `C:\php8.5\php.exe` (8.5.13); Composer PHAR: `C:\Users\moxfo\composer.phar` (2.11.2).
- Node/npm: 26.13.1 / 11.17.0. Google Chrome is installed and used headless through a fresh isolated CDP profile for the final browser pass.
- App URL: `http://127.0.0.1:8000`; register `/products`; detail `/products/{id}`; API `/api/v1/products`; sign-in `/sign-in`.
- MariaDB loopback port defaults to 3307. Docker operations on this host require Administrator PowerShell; no Windows security/group settings were changed.
- `.env`, `.env.testing`, database credentials, `APP_KEY`, and P03 demo credentials remain ignored local data. The local PHP/Vite server was already listening before the task and was left running.

## Uncommitted or Partially Applied Changes

All task changes remain unstaged and uncommitted on `main`. The repository scaffold and most P01/P02 application/docs content were already untracked in the starting state; `README.md` was already modified. P03 additions are new untracked files and P03 edits to existing untracked files remain untracked; no changes were staged, committed, discarded, or reset. The only development DB changes were the requested additive migrations and repeatable synthetic demo provisioning.

## Recovery or Rollback Notes

Keep `erp_mariadb_data`, `.env`, `.env.testing`, the ignored P03 credential file, and the database-safety guard. Do not use `down -v`, reset `erp_dev`, delete local environment files, or change Windows security/group settings. The migration that restores global product-code uniqueness refuses rollback while different organizations share a code; first reconcile/rename duplicate codes before considering that rollback. User-owned source and plan files remain intact.

## Related Documentation

- `AGENTS.md` — repository-specific rules and runbook pointers.
- `README.md` — setup, ignored local P03 credentials, role matrix, provisioning, and accepted-phase verification.
- `docs/MASTER_PLAN.md` — preserved phase roadmap.
- `docs/UI_DESIGN.md` — P02/P03 UI behavior, Chrome screenshots, and mobile geometry evidence.
- `docs/okf/index.md`, `docs/okf/architecture/authentication-and-organization-access.md`, and `docs/okf/security/organization-access.md` — current project knowledge and access boundary.
- `docs/okf/decisions/adr-002-p03-session-and-organization-boundary.md` — accepted P03 decision.

## Notes for the Next Agent

P03 is accepted and complete. P04 remains planned and outside the current work. Before starting it, check the actual Git state and read the current handoff plus P04-relevant OKF material. Do not stage or commit for the user.
