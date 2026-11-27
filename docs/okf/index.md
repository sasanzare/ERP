---
okf_version: "0.2"
---

# ERP Project Knowledge

This bundle records the scope, architecture, and decisions for the local-development ERP project. P01–P13 are accepted at their local-development boundaries. P10 approval is limited to the exact local synthetic invoice and settlement mapping in ADR-008; live/production posting remains disabled. See the handoff for current runtime and acceptance evidence.

## Start here

- [Project overview](project-overview.md) — scope and phase boundaries.
- [Architecture](architecture/index.md) — current and planned runtime shape.
- [P04 master-data architecture](architecture/p04-master-data.md) — scoped APIs, shared registers/forms, and selected-list pricing.
- [P05 sales workflow](architecture/p05-sales-workflow.md) — leads, follow-ups, quote snapshots, and confirmed order conversion.
- [P06 stock workflow](architecture/p06-stock-workflow.md) — standalone stock operations, balance views, and reservations.
- [P07 sales fulfillment](architecture/p07-sales-fulfillment.md) — linked reservations, partial delivery, immutable issue trace, and remainder cancellation.
- [P08 purchasing](architecture/p08-purchasing.md) — request approval, supplier-order snapshots, exact Rial totals, and partial warehouse receipts.
- [P09 accounting](architecture/p09-accounting.md) — manual balanced journals, fiscal periods, posting identity, and reversals; source-driven posting remains gated by open domain decisions.
- [P10 settlement](architecture/p10-settlement.md) — accepted local ERP MVP paths for customer/supplier invoices, open items, treasury movements, allocations, and P09 journal links.
- [P11 dashboard](architecture/p11-dashboard.md) — read-only reporting workspace, source drill-downs, timezone contract, and safe walkthrough command.
- [P12 project work](architecture/p12-project-work.md) — organization-scoped projects, task transitions/counts, assigned inbox, local due reminders, and P08 purchase-line costs.
- [P13 administration and party exchange](architecture/p13-administration-and-data-exchange.md) — separately provisioned membership role management and safe, retryable CSV/XLSX party import/export.
- [Data models](data/index.md) — organization-owned master data and exact rial amount storage.
- [P05 sales documents](data/p05-sales-documents.md) — organization-scoped sales records and exact Rial-to-Toman calculations.
- [P06 stock data](data/p06-stock-balances.md) — stock keys, exact quantities, balance equations, opening rule, and correction strategy.
- [P07 fulfillment data](data/p07-sales-fulfillment.md) — order-line quantity reconciliation, linked reservation counters, delivery links, and migration evidence.
- [P08 purchasing data](data/p08-purchasing.md) — source-linked request/order lines, purchase-price snapshots, exact receipt quantities, and movement IDs.
- [P09 accounting data](data/p09-accounting.md) — books, accounts, periods, immutable posted journals, exact Rial lines, source references, and retry keys.
- [P10 settlement data](data/p10-settlement.md) — exact Rial invoices/open items, source delivery/receipt links, treasury movements, allocations, and the P11 as-of reporting contract.
- [P11 reporting data](data/p11-reporting.md) — four metric definitions, timestamp and date boundaries, exact units/currency, exclusions, and reconciliation.
- [P12 project work data](data/p12-project-work.md) — project/task/comment/reminder tables and the unique exact-rial purchase-line association.
- [P13 role administration and party imports](data/p13-administration-and-data-exchange.md) — manager grants, normalized import hashes, row outcomes, and party register export.
- [Organization access security](security/organization-access.md) — session, membership, product isolation, and role boundary.
- [P04 master-data isolation](security/p04-master-data-isolation.md) — reader/editor, selectors, foreign IDs, and relationship checks.
- [P05 sales isolation](security/p05-sales-isolation.md) — document scoping, editor writes, transitions, and conversion safeguards.
- [P06 stock isolation](security/p06-stock-isolation.md) — organization-scoped stock reads/writes, location pairing, and concurrency locks.
- [P07 fulfillment isolation](security/p07-sales-fulfillment.md) — scoped order-line actions, editor permissions, and linked-reservation release protection.
- [P08 purchase isolation](security/p08-purchasing.md) — independent approver, organization-scoped supplier/order/receipt access, and idempotency controls.
- [P09 accounting isolation](security/p09-accounting.md) — active-organization scope, editor writes, reader review, scoped line accounts, and serialized period closure.
- [P10 settlement isolation](security/p10-settlement.md) — primary-document scope, editor/CSRF enforcement, retry locking, P09 atomicity, and synthetic-only posting profiles.
- [P11 reporting isolation](security/p11-reporting.md) — active-organization read scope, organization-owned book validation, and test/development seed restrictions.
- [P12 project work isolation](security/p12-project-work.md) — member/editor access, parent scoping, valid assignees, current-recipient reminders, and purchase-line uniqueness.
- [P13 membership and party exchange](security/p13-administration-and-data-exchange.md) — role-manager authority, target-first scoping, per-row import authorization, and active-organization export.
- [UI design reference](../UI_DESIGN.md) — shared P02 workspace design and P03–P09 browser evidence.
- [Decisions](decisions/index.md) — accepted project decisions and active records for rules still awaiting production approval.
- [ADR-006: P07 reserved issues and lock order](decisions/adr-006-p07-reserved-sales-order-issues.md) — atomic reserved delivery, idempotency, cancellation, and cross-module locking.
- [ADR-007: P08 approval, currency, and receipt locking](decisions/adr-007-p08-purchase-approval-and-pricing.md) — no self-approval, whole-rial snapshots, and atomic inbound trace.
- [ADR-008: P09 accounting scope and posting decisions](decisions/adr-008-p09-accounting-scope-and-posting-decisions.md) — P09 manual scope, the user-approved local P10 mapping and paths, and remaining live/production gates.
- [ADR-009: P13 separate membership role manager](decisions/adr-009-p13-role-management.md) — local membership role administration is distinct from operational editor access.
- [Maintenance log](log.md) — significant knowledge updates.

Read [HANDOFF.md](../../HANDOFF.md) for current repository state, validation evidence, and exact next steps.
