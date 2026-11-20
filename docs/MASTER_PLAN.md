# ERP master plan — local development

**Start with P01.** Build one local application with a Laravel backend, a Persian RTL React frontend and a Dockerized MariaDB database. **Liquid Glass Design is the required visual identity for the entire UI.** The executor is **GPT-6 Luna with maximum reasoning effort (`max`)**.

There are **13 executable phases**. Run one prompt per phase. P01 delivers the first database-backed page, P02 establishes the visual reference for future screens, P07 completes the first sales-to-stock journey, and P11 delivers the local MVP. P12 and P13 extend that MVP. As of 2026-11-20, all implementation phases are planned.

## Architecture decisions for kickoff

| Area | Working decision |
|---|---|
| Backend | One Laravel application with modules for identity, master data, sales, inventory, procurement, finance and work management. Laravel owns authorization, document transitions and calculations. Modules call each other through explicit application actions where an operation crosses domains. |
| Frontend | React with TypeScript and Vite under `resources/js/`. Laravel serves the HTML entry and same-origin JSON routes under `/api/v1/`. Vite serves development assets. Use session cookies and CSRF protection for browser writes. |
| Database | Use **MariaDB** as the single development engine. Record the selected supported image tag and matching Laravel connection driver in P01. MariaDB and MySQL are distinct engines. Keep migrations portable where practical. Compatibility with a specific MySQL release requires its own verification when that target is known. |
| Local runtime | PHP/Composer and Node/npm run on the developer machine. Docker Compose runs one database service named `db`, with a health check, a named volume and a loopback-only published port. Proposed endpoints are Laravel at `127.0.0.1:8000` and MariaDB at `127.0.0.1:3307`. Make the host DB port configurable so an existing XAMPP database can keep using 3306. |
| Environment boundary | The entire roadmap runs on the developer machine. Automated tests use a disposable schema on the same local MariaDB service. Staging, production configuration, host access and deployment are outside this roadmap. A future cPanel host can provide the database server; phpMyAdmin is its administrative UI. Choosing that host is independent of starting P01. |
| Language and data | Product UI is Persian and RTL. Use original UI assets and synthetic fixtures. Keep source identifiers and technical documentation in English. Store precise quantities and canonical rial amounts, render explicit units, and convert to toman at the presentation boundary. |

The stack is a choice for this application. The demo established user-visible relationships among parties, sales documents, inventory movements, tasks and journals. Its backend technology and write-side rules remain unknown. [Observed workflows](reverse-engineering/04-functional-analysis.md) · [Technical findings](reverse-engineering/05-technical-findings.md) · [Limits of the demo](reverse-engineering/06-unknowns-and-limitations.md)

## UI contract · Liquid Glass Design

**Every phase that creates or changes a visible screen must use the installed `liquid-glass-design` skill.** This covers sign-in, navigation, dashboards, registers, detail pages, forms, dialogs, mobile views and their loading, empty, error and denied states. Carry this requirement into each UI implementation prompt and acceptance review.

| Design decision | How it applies in this ERP |
|---|---|
| Composition | Adapt the skill’s **Lens Inspector** recipe for desktop. Give the user one main work surface, a compact command bar and a grouped supporting rail. On mobile use the **Mobile Focus Sheet** recipe with a bottom command area and room for the last editable row. |
| Material and readability | Use a restrained backdrop with enough local detail to show refraction at the glass edge. Use Regular glass for navigation, toolbars and dialogs; Tinted glass for primary actions, selected filters and dense panel surrounds. Give tables, invoice amounts, Persian labels and inputs a quiet surface with crisp text and aligned numerals. |
| Shared implementation | Define the material once in React primitives and shared tokens for tint, rim, refraction, radius, focus and motion. Follow the skill’s measured, per-surface CSS/SVG lens approach and cache maps by geometry. Reuse the same primitives for filters, status chips, menus and forms across modules. |
| Interaction and fallback | Give hover, press, selection, keyboard focus and disabled states distinct cues. Keep text and icons sharp when the backdrop changes. Reduced motion disables pointer-following effects. Reduced transparency, increased contrast or unavailable backdrop filters activate a stronger solid/tinted surface. |
| Acceptance evidence | P02 establishes desktop (1280 px) and mobile (390 px) screenshots of the same product, including a table, toolbar, primary action and open dialog. Check bright and dark backdrops, keyboard focus, long Persian labels and a filter-disabled fallback. Mark stage, focus, dock and rail with the skill’s `data-lg-role` attributes as applicable; use a geometry check for overlap or clipped controls. Later UI phases attach evidence from the changed business screen and reuse this reference. |

## Executable phases

Each phase has a single outcome. The numbered ID is the work order. The implementation steps and checks inside a phase run under that same prompt. Use synthetic fixtures throughout. The observed demo supplies navigation and terminology; the team sets the write-side rules. [Page inventory](reverse-engineering/02-page-inventory.md) · [UI patterns](reverse-engineering/03-ui-components.md)

### P01 · Local application boots end to end

**Depends on:** this plan. Inspect the proposed `erp/` application root and existing work. Check PHP and `pdo_mysql`, Composer, Node/npm, Docker and Compose. Pin compatible versions and dependency locks. Create the Laravel/React entry, the local database service, health check, named volume, untracked credentials and `.env.example`. Configure separate development and disposable test schemas with scoped users. Add a minimal product migration, repeatable seed, JSON endpoint and Persian product view using the Liquid Glass skill. Initialize the project README, AGENTS, HANDOFF and relevant OKF documents.

**Accept when** the page reads one product from Laravel, seeding twice preserves one record, and the product survives a database restart. A Laravel feature test uses the isolated schema; the reset guard refuses the development schema. The React build passes. Record the actual first-run commands.

### P02 · Reusable Liquid Glass workspace

**Depends on:** P01. Apply the UI contract to the real product view. Build the RTL desktop shell, narrow-screen navigation, shared glass toolbar, list/detail surface, form controls and dialog. Document their tokens and usage in the application’s design reference. Keep the first product view as the visual baseline.

**Accept when** the same product is legible on desktop and mobile, deep link/refresh/Back work, the dialog can be opened and closed by keyboard, controls avoid overlaps, and the low-transparency fallback remains usable. Save the screenshots and geometry results defined above.

### P03 · Sign-in and organization access

**Depends on:** P01, P02. Add session login/logout, organizations, memberships, a role matrix and Laravel policies. Scope the product endpoint and its representative write operation to the active organization. Show permission-aware navigation and denied states using the shared shell. Record role assignments in the audit trail.

**Accept when** two organizations can use the same product code independently. Direct list, detail and write requests respect membership; a read-only user cannot edit; logging out ends access.

### P04 · Shared parties, products and locations

**Depends on:** P03. Deliver searchable registers, details and forms for party roles, units, products, warehouses, locations and price lists. Extend the P01 product. Reuse one register/form pattern across these resources.

**Accept when** one party serves as both customer and supplier under one ID. A product resolves its base unit and selected list price. Duplicate local codes, a foreign organization’s unit and a location belonging to the wrong warehouse fail validation.

### P05 · Lead to confirmed sales order

**Depends on:** P04. Link leads, dated follow-ups, quotations and sales orders. Set the currency, quantity precision, rounding, price snapshots and allowed transitions. Implement one calculation shared by the quote and order workflow.

**Accept when** an overdue activity leaves the open queue after completion. A two-line quote including fractional quantity and discount yields the expected rial total. Converting it twice creates one order; both documents retain their prices after the price list changes.

### P06 · Trustworthy stock balances

**Depends on:** P04. Build the movement ledger for opening stock, receipt, issue and paired location transfer. Add reservations and release. Define available stock and negative-stock policy. Make each movement atomic and protect concurrent reservations on MariaDB.

**Accept when** reserving three of ten leaves ten physical and seven available; releasing restores ten available. A transfer of four produces balances of six and four, and a failed transfer changes neither location. Two requests for the last unit produce exactly one reservation. An excessive issue leaves the ledger unchanged.

### P07 · Fulfil a sales order

**Depends on:** P05, P06. Connect sales lines to reservations and warehouse issues. Add partial delivery, release of the remainder and links from the order to its movements.

**Accept when** delivering two of three reserved units from ten leaves eight physical, one reserved and seven available. Cancelling the remainder restores eight available. Retrying delivery creates no second issue. Demonstrate the journey in React.

### P08 · Purchase request to receipt

**Depends on:** P04, P06, P07. Build request lines, approval, supplier order and receipt against order lines. Record the self-approval policy and snapshot agreed prices. Reuse the existing warehouse receipt operation.

**Accept when** an unauthorized approver cannot advance a request, a repeated conversion produces one purchase order, and receiving five units in batches of three and two closes that order. Replaying a receipt leaves inventory unchanged.

### P09 · Balanced accounting engine

**Depends on:** P05, P08. First record worked journal examples with the domain owner for sale, purchase, collection, payment and reversal. Resolve the posting triggers, tax, costing, rounding and closure rules those examples use. Implement books, chart of accounts, periods, atomic journal posting and reversal.

**Accept when** debits equal credits in each fixture. Unbalanced entries, non-postable accounts and entries dated in a closed period are rejected. A retry yields one posting. Original and authorized reversal sum to zero by account, including after retry. Record open domain decisions before implementing the affected posting.

### P10 · Customer and supplier settlement

**Depends on:** P07, P08, P09. Connect sales invoices to receivables and supplier invoices to payables. Allocate receipts/payments with links to treasury movements, journals and source documents. Use one settlement model where both sides share the same rules.

**Accept when** collecting 400,000 rial on a 1,000,000-rial customer invoice leaves 600,000 rial and displays 60,000 toman. A supplier payment reconciles to its payable, purchase order and receipt. Retrying either allocation leaves the balance unchanged.

### P11 · Reconciled local MVP

**Depends on:** P10. Build dashboard tiles for net sales, overdue receivables, available stock and pending approvals. Link each to its contributing records. Package both business journeys in a repeatable local seed and first-run walkthrough.

**Accept when** all four totals match independent calculations for the selected organization, book, currency unit and date. From a clean local schema, demonstrate sale → issue → collection and purchase → receipt → payment. Run the local regressions and check the responsive dashboard against P02. **This is the local MVP gate.**

### P12 · Projects and assigned work

**Depends on:** P11. Deliver project and task details, board/list views, due dates, assignments, comments, local reminders and a mobile work inbox. Link existing purchasing costs to the associated project.

**Accept when** an assignee follows an inbox item to its project and completes it. Counts match across views, a due reminder appears once, one cost links to its purchase line, and another organization cannot read the project’s comments.

### P13 · Administration and data exchange

**Depends on:** P11. Build the role editor and audit view on P03 policies. Add one party-import pipeline with CSV/XLSX adapters, preview, row validation, deduplication and retry. Apply the register’s authorization and filters to exports.

**Accept when** a permitted role change takes effect and appears in the audit view. Equivalent CSV and XLSX fixtures each explain a valid, duplicate and invalid row. Preview leaves storage unchanged; retrying an interrupted apply creates each accepted row once. Export contains exactly the authorized filtered IDs and preserves Persian text.

## Later feature choices

The demo also exposed tax and cost-center reference data, full stock counts, lots/serials, returns, commissions, bank reconciliation, advanced statements, subscriptions and assistants. Keep these in the product backlog. Promote one when there is a user need, a settled domain rule and a worked acceptance example. External services use local fakes during development. [Functional analysis](reverse-engineering/04-functional-analysis.md) · [Observed limits](reverse-engineering/06-unknowns-and-limitations.md)

## Local runbook target

**Expected first-run sequence once the scaffold exists.** From the application root, install locked dependencies with `composer install` and `npm ci`, create the local `.env` from the example, fill local database credentials, and run `php artisan key:generate` once. Then run:

```powershell
docker compose up -d --wait db
php artisan migrate --seed
php artisan serve --host=127.0.0.1 --port=8000
```

In a second terminal, run `npm run dev`. Open `http://127.0.0.1:8000`. For daily use, start the same database and the two dev processes. Stop the database with `docker compose stop db`. [Laravel and Vite](https://laravel.com/docs/13.x/vite) · [Laravel database configuration](https://laravel.com/docs/13.x/database) · [Official MariaDB image](https://hub.docker.com/_/mariadb) · [Compose startup](https://docs.docker.com/reference/cli/docker/compose/up/)

## Generate one implementation prompt

For each phase, provide its ID, accepted dependencies, actual application root, current HANDOFF, relevant OKF concept, expected deliverable and acceptance fixture. Tell GPT-6 Luna to use reasoning effort `max`. **Include the Liquid Glass Design skill and UI acceptance criteria in every prompt that touches UI.** For accounting and inventory changes, include the numeric example and the failure/retry case. A phase may use internal checkpoints in HANDOFF and resume with its existing ID.

### Ready-to-use kickoff prompt

> Execute P01 only from MASTER_PLAN.md using GPT-6 Luna with reasoning effort max. Inspect the proposed erp/ root, applicable project instructions and existing changes. Implement the local browser-to-database product view with Laravel, React/TypeScript, Vite and Dockerized MariaDB. Use the Liquid Glass Design skill for the first Persian RTL surface. Run P01’s persistence, repeat-seeding, isolated-test and frontend-build checks. Document actual commands and results in the application README, HANDOFF and relevant OKF. Finish with the phase status and inputs for P02.

To request a later prompt, use `پرامپت اجرایی فاز P02 را بر اساس MASTER_PLAN.md و آخرین HANDOFF بساز` with the desired ID. Record each phase as `PLANNED`, `IN_PROGRESS`, `PARTIAL` or `ACCEPTED`. Mark it accepted after its observable checks pass.
