# P14 Baseline Inventory

## Scope and discovery

This is a local-development-only audit of the existing NoSyntax ERP. No application code, business logic, schema, migration, dependency, lockfile, production setting, or persistent development record was changed.

The requested English path docs/MASTER_PLAN_V2.md is absent. The available V2 plan is the user-provided, untracked Persian file docs/NoSyntax_ERP_MASTER_PLAN_V2_FA.md. The answered Q01-Q54 questionnaire is docs/requirements/NoSyntax_ERP_Requirements_Questionnaire_FA_Answered.md, also untracked. Both files were read and left unchanged. No nested AGENTS.md or AGENTS.override.md was found. The current P01-P13 acceptance history is in README.md, HANDOFF.md, docs/UI_DESIGN.md, phase-specific OKF, tests, and screenshots; no pre-existing docs/acceptance report directory existed.

The project-specific lessons log at D:\All projects\Mistakes\ERP\mistakes.md was read and its root fingerprint matched this repository. It already records the handoff/Git reconciliation lesson. No new reusable mistake was found, so no entry was needed. The directory is outside the writable workspace.

## Repository baseline

| Field | Observed value |
|---|---|
| Repository root | D:\All projects\ERP |
| Branch | main |
| HEAD | 74fedb92d9b1f0a9486a9efe6f35a3ec76577d61, feat(p13): add administration and party data exchange |
| Remote comparison | main matches origin/main at baseline |
| Tracked modifications | None |
| Staged changes | None |
| Pre-existing untracked files | docs/NoSyntax_ERP_MASTER_PLAN_V2_FA.md; docs/requirements/NoSyntax_ERP_Requirements_Questionnaire_FA_Answered.md |
| Untracked-file SHA-256 | V2: d812925116d4f5005d99c4965b08d6a183c69077e92a7d4eb4d1b1398a789618; questionnaire: 3ce92ef4cf9590cee06c0fcd08a17eb9039b0998cc213183308ce93458793879 |
| Baseline worktree fingerprint | 4b53f690ff16f18e2e8537b60c0fa420d8d1e2b6c687fec035197d1d72a454c9; SHA-256 of sorted status/path/content-hash manifest for the two pre-existing untracked files |
| Historical handoff accuracy | HANDOFF still described P13 as uncommitted at the P12 commit; actual HEAD contains the P13 commit. This audit reconciles the current handoff without rewriting phase history. |

P14 began with no tracked source changes. Later P14 additions are documentation/governance-only under docs/acceptance/v2/P14 and canonical ADR-010; AGENTS.md, HANDOFF.md, and OKF navigation/project-overview/log were updated. The two user-provided untracked documents remain unchanged.

## Host and package inventory

| Component | Observed version/state |
|---|---|
| OS | Microsoft Windows 10.0.26300 |
| PHP CLI | 8.5.13 at C:\php8.5\php.exe |
| Laravel | 13.43.0 |
| Composer | 2.11.2, invoked through C:\Users\moxfo\composer.phar |
| PHPUnit | 12.5.45 |
| Laravel Pint | 1.32.3 |
| Node.js | 26.13.1 |
| npm | 11.17.0 |
| React / React DOM | 19.3.1 / 19.3.1 |
| TypeScript | 5.9.3 |
| Vite | 8.3.8 |
| Standalone Playwright package | playwright and playwright-core are absent from local node_modules |
| Docker CLI / Compose | 29.9.2 / v5.6.1 |
| MariaDB server | 11.8.9, confirmed by a read-only connection to erp_dev |
| Compose database | erp-local-db-1 running, loopback 127.0.0.1:3307 -> 3306 |
| Database metadata | erp_dev, 56 tables, migrations 0001-000014 all marked Ran (latest batch 11) |
| Test database metadata | erp_test, migrations 0001-000014 all marked Ran |
| PHP extensions | pdo_mysql, mysqli, xmlreader, zip present; intl absent |

Installed PHP and npm package versions were read from the local Composer and npm installations. No dependency was installed or upgraded.

## Environment boundaries and test safety

The sanitized local environment identifiers are APP_ENV=local, APP_DEBUG=true, DB_CONNECTION=mariadb, DB_HOST=127.0.0.1, DB_PORT=3307, DB_DATABASE=erp_dev, DB_USERNAME=erp_app. The separate test file identifies APP_ENV=testing, DB_DATABASE=erp_test, DB_USERNAME=erp_test, and the same loopback port. Passwords and APP_KEY were not printed or copied into this report.

The repository test guard at app/Support/DatabaseTestSafetyGuard.php:12-79 requires APP_ENV=testing, MariaDB, loopback host, erp_test/erp_test, matching DB_PORT and DB_FORWARD_PORT, and empty DB_URL/DB_SOCKET. Tests/TestCase.php calls this guard before Laravel setup. The test suite was run only after inspecting that guard and confirming the active .env.testing fields. One Laravel test process ran at a time.

compose.yaml defines only the local MariaDB service and persistent erp_mariadb_data volume. No production database, staging environment, load-test environment, or production deployment was accessed or configured. The database target and migration ledger were read only. Tests used the guarded erp_test schema; no migration command was run by P14 and no erp_dev migration was applied.

## P01-P13 historical phase verification

The phase acceptance criteria below are concise summaries of README.md, docs/MASTER_PLAN.md, HANDOFF.md, docs/UI_DESIGN.md, phase tests, and the corresponding OKF concepts/ADRs. Full historical result details remain in those source documents. Current static inspection and the new P14 test run are separate from historical UI acceptance.

| Phase | Original objective and historical status | Historical acceptance criteria summary | Current code/tests/evidence | Security/deferred boundary and current relevance |
|---|---|---|---|---|
| P01 | Local application boots end to end; accepted 2026-11-20. | Start Laravel/Vite/MariaDB, persist and replay demo data, exercise test DB isolation, render product read/failure states in browser. | Product shell and API, ProductIndexTest/WorkspaceEntryTest, README P01 and UI_DESIGN evidence. | Test schema is separated from erp_dev. Product shell remains the original default route. |
| P02 | Reusable Liquid Glass workspace; accepted 2026-11-20. | Shared Persian RTL shell, mobile dock, keyboard/fallback/reduced-transparency behavior and no overflow at accepted viewports. | WorkspaceShell/LiquidGlass/CSS, UI_DESIGN P02 evidence and historical screenshots. | No business authorization boundary was added by P02. Current visuals were not recaptured during P14. |
| P03 | Sign-in, organizations, and access enforcement; accepted 2026-11-20. | Session login/logout, CSRF, organization isolation/switching, reader denial, editor write, repeatable provisioning, guarded tests. | SessionController, ResolveActiveOrganization, OrganizationPolicy, SessionAuthenticationTest, P03OrganizationAccessTest. | Current fixed roles are editor/reader; no MFA, recovery, Google login, or offboarding. |
| P04 | Shared parties/products/units/warehouses/locations/price lists; accepted 2026-11-21. | Organization-scoped uniqueness/foreign IDs, editor-only writes, reader review, exact Rial price lookup, repeat seed, migration preservation. | P04 controllers/migration, P04MasterDataTest, README/UI evidence. | Reuse for V2 customer/product references; goods catalog does not satisfy dynamic services. |
| P05 | Lead to confirmed sales order; accepted 2026-11-21. | Lead/follow-up/quote/order lifecycle, exact Toman rounding/snapshots, reader denial, failed-transition rollback, idempotent conversion. | P05 controllers/calculator, P05SalesWorkflowTest, SalesDocumentCalculatorTest, README/UI evidence. | Useful CRM/quote reuse; no contract/amendment/installment workflow. |
| P06 | Trustworthy stock balances; accepted locally. | Immutable stock movement/balance equations, exact quantities, location pairing, reservation lifecycle/idempotency and contention checks. | StockService, P06 migration, P06StockWorkflowTest, historical UI evidence. | Optional goods inventory is to be preserved; not a project progress source. |
| P07 | Fulfill confirmed sales orders; accepted locally. | Link reservation to order line, partial delivery, cancellation of remainder, atomic stock issue, retries and concurrency. | SalesFulfillmentService, P07 migration, P07SalesFulfillmentTest, README/UI evidence. | Remains a goods workflow; P10 can invoice only its approved local delivered-quantity paths. |
| P08 | Purchase request to warehouse receipt; accepted locally. | Independent approval/no requester self-approval, whole-Rial price snapshots, partial receipt, atomic P06 integration, retries/contention. | PurchasingService/controller, P08 migration, P08PurchasingTest, README/UI evidence. | Reuse purchase-line records for P12 costs; source posting into P09 remains disabled. |
| P09 | Balanced accounting engine; accepted for manual synthetic journals. | Exact whole-Rial lines, balanced posting, account/period validation, concurrency/idempotency, immutable posted journals and appended reversal. | AccountingService/calculator, P09 migration, P09AccountingTest, ADR-008. | Manual synthetic boundary only; source-driven sales/inventory/purchase posting is unapproved. |
| P10 | Customer/supplier invoices and settlements; accepted locally for a specific synthetic mapping. | Delivered/received quantity basis, exact account mapping/amounts, full allocation, retry after closure, closed-period rejection, no standalone linked-journal reversal. | SettlementController/P10SettlementService/profile resolver, P10SettlementTest, ADR-008, UI evidence. | Local synthetic profile only. No production profile or correction/void authority is approved. |
| P11 | Read-only reconciled dashboard and repeatable local walkthrough; accepted locally. | Selected-book financial cutoff, organization-wide stock/approval scope, exact units, source-row reconciliation, repeat-safe walkthrough, no writes. | P11DashboardService, P11DashboardTest, UI evidence and README. | Read-only reuse only; not a V2 project-profit model. |
| P12 | Projects and assigned work; accepted locally. | Member/editor scoping, task status transitions, due-date rules, reminder identity/reassignment, comments, exact unique P08 cost snapshot. | ProjectWorkService/DueReminderService, P12 migration, P12ProjectWorkTest, UI evidence. | Reuse project/task core; no phases, approval-based progress, time/capacity, or contract linkage. |
| P13 | Role administration and party exchange; accepted locally. | Separate role-manager grant, scoped role history/audit, last-manager protection, import preview with zero writes, create-only retry, safe filtered CSV export. | MembershipRoleService, PartyImportParser/Service, P13 migration, P13AdministrationTest, UI evidence. | Manager authority is not PM/Finance/HR RBAC. Import is not a general document platform. |

P01-P13 are recorded as historically accepted only at their local boundaries. The full P14 run tests the current repository, not the historical browser state. No existing acceptance report was edited to make earlier results appear more complete.

## Validation outcomes

See evidence/command-results.md for exact commands, environment, exit codes, and limitations. The focused P10 suite passed 4 tests / 129 assertions; the full guarded suite passed 110 / 1,347; composer validate, npm typecheck, npm build, route inventory, and both migration-ledger reads passed.

The read-only db:show --counts reached erp_dev and reported MariaDB 11.8.9 and 56 tables, then exited because the host PHP lacks intl. It did not establish row counts. Composer and npm advisory audits could not reach their public registries because DNS/network access was unavailable. Static browser-source review was completed; current-route browser screenshots were blocked by loopback timeouts.
