# P14 Command Results

Commands ran on the local Windows host. Secret values were not printed. No source, schema, dependency, lockfile, or persistent development record was changed.

| Command | Target/environment | Exit code | Observed result |
|---|---|---:|---|
| C:\php8.5\php.exe artisan --version | Local host PHP | 0 | Laravel Framework 13.43.0. |
| C:\php8.5\php.exe C:\Users\moxfo\composer.phar --version | Local Composer PHAR | 0 | Composer 2.11.2. |
| node --version; npm --version | Local host | 0 | Node v26.13.1; npm 11.17.0. |
| docker --version; docker compose version | CLI only | 0 | Docker 29.9.2; Compose v5.6.1. |
| docker compose ps --format 'table {{.Name}}\t{{.State}}\t{{.Ports}}' | Read-only Compose state, elevated | 0 | erp-local-db-1 running, 127.0.0.1:3307->3306/tcp. |
| C:\php8.5\php.exe artisan db:show --counts | Read-only erp_dev connection | 1 | Connected and reported MariaDB 11.8.9, erp_dev, 127.0.0.1:3307, erp_app, 56 tables. Then failed because PHP intl is absent; row counts were not collected. |
| C:\php8.5\php.exe artisan migrate:status --env=local --no-ansi | Read-only erp_dev migration ledger | 0 | Migrations 0001_01_01_000000 through 2026_11_26_000014 all Ran; latest batch 11. |
| C:\php8.5\php.exe artisan migrate:status --env=testing --no-ansi | Read-only erp_test migration ledger | 0 | All 14 migrations Ran. |
| C:\php8.5\php.exe C:\Users\moxfo\composer.phar validate --no-check-publish | Local composer.json/lock | 0 | composer.json valid. |
| npm run typecheck | Local TypeScript | 0 | tsc --noEmit passed. |
| npm run build | Local Vite | 0 | 52 modules transformed; app entry 497.58 kB, P12 26.97 kB, P13 9.34 kB. Generated public/build output is ignored. |
| C:\php8.5\php.exe artisan route:list --except-vendor | Local route inventory | 0 | 130 non-vendor routes. API routes are under web/auth/active-organization; mutations are in the explicit CSRF group. |
| C:\php8.5\php.exe artisan test tests/Feature/P10SettlementTest.php | Guarded erp_test | 0 | 4/4 tests / 129 assertions passed; no failures or skips reported. |
| C:\php8.5\php.exe artisan test | Guarded erp_test, serial | 0 | 110/110 tests / 1,347 assertions passed; 0 failures and no skips reported. README historical P13 result was 110 / 1,344. |
| C:\php8.5\php.exe vendor\bin\pint --test | Read-only formatting check | 1 | Existing findings in unchanged app/Support/DatabaseTestSafetyGuard.php: fully_qualified_strict_types, unary_operator_spaces, not_operator_with_successor_space, ordered_imports, phpdoc_align. No formatter ran. |
| C:\php8.5\php.exe C:\Users\moxfo\composer.phar audit --locked --no-interaction | Public registry advisory check | 1 | No advisory result; DNS could not resolve repo.packagist.org. Not a clean audit. |
| npm audit --no-fund --no-progress | Public registry advisory check | 1 | No advisory result; DNS could not resolve registry.npmjs.org. Not a clean audit. |
| git -c core.fsmonitor=false diff --check | Final tracked diff whitespace check after P14 documentation edits | 0 | No whitespace errors. |
| git -c core.fsmonitor=false status --short --branch | Final Git readback after D01 documentation closure | 0 | main remains at HEAD 74fedb92d9b1f0a9486a9efe6f35a3ec76577d61; tracked documentation changes are limited to AGENTS.md, HANDOFF.md, docs/okf/index.md, docs/okf/decisions/index.md, docs/okf/project-overview.md, and docs/okf/log.md. Canonical ADR-010 and P14 artifacts are untracked alongside the two pre-existing user documents. No application source, tests, migrations, manifests, or lockfiles changed. P14 manifest fingerprint is recorded in report.md/HANDOFF.md; report, handoff, and this evidence file content hashes are excluded to avoid self-reference. |
| php artisan migrate:status --env=local --no-ansi; php artisan migrate:status --env=testing --no-ansi | Final read-only migration-ledger read, elevated | 0 | All 14 migrations remain Ran in erp_dev and erp_test; erp_dev latest batch remains 11. |
| Browser GET to http://127.0.0.1:8000/sign-in | In-app browser, isolated Chrome, elevated host request | N/A | All attempts timed out. Temporary browser tab and local dev servers were stopped; no screenshot was accepted. |

## Generated/local-only artifacts

The production build refreshed ignored public/build output. PHPUnit may refresh the ignored .phpunit.result.cache, and Vite may refresh node_modules/.vite. These are generated caches/build artifacts; tracked application source remained unchanged.

## Final documentation validation

- Parsed requirements_traceability.json and verified 54 unique Q01-Q54 records and expected status counts.
- Validated changed-document internal links, Markdown fences/whitespace, canonical ADR-010 YAML frontmatter and internal links, root OKF 0.2 metadata, and git diff --check.
- No test or application check was rerun for the documentation-only D01 closure.
- evidence/SHA256SUMS.txt was generated for README.md, command-results.md, and browser-capture.md; all three hashes were verified by readback.
- Final Git status/HEAD was read back. evidence/worktree-manifest.txt records the final SHA-256 over sorted Git status/path/content-hash rows with explicit self-reference exclusions; the digest was recomputed and matched.

## Advisory research

Focused current upstream advisory checks were performed against the official GitHub repository/security pages. See SECURITY_AND_THREAT_MODEL.md for patched-version comparisons and applicability notes. This focused lookup does not replace the blocked complete Composer/NPM lockfile audits.
