# Database and Financial Integrity Audit

## Database baseline and scope

The only permitted development schema inspected was erp_dev. A read-only connection identified MariaDB 11.8.9, database erp_dev, loopback host 127.0.0.1:3307, user erp_app, and 56 tables. Read-only migration-ledger inspection reported migrations 0001_01_01_000000 through 2026_11_26_000014 as Ran, latest batch 11.

The separate test schema is erp_test on the same loopback port using erp_test. The repository guard verified APP_ENV=testing, DB_CONNECTION=mariadb, host 127.0.0.1, DB_PORT=DB_FORWARD_PORT=3307, DB_DATABASE=erp_test, DB_USERNAME=erp_test, and empty DB_URL/DB_SOCKET; its read-only migration ledger reported all 14 migrations as Ran. Focused P10 and full suite ran through this guarded test workflow only.

No migration was applied by P14. No mutation, fixture provisioning, reset, or row export was run against erp_dev. Docker volume erp_mariadb_data was not reset. The evidence does not contain a before/after row-count comparison; no row counts were collected. artisan db:show --counts connected and reported version/table metadata but then failed because host PHP lacks intl. Production databases were not accessed.

## Schema and data ownership

The schema contains dedicated migrations through P13 for organizations/memberships, shared master data, sales, inventory, purchasing, accounting, settlement, project work, and administration/exchange. Organization IDs are carried into domain tables; the current schema uses scoped unique keys and composite foreign keys in the P08/P12/P13 areas. P12 task/comment/reminder/project-cost relations include organization/project scope; P13 role-manager and import records bind to organization membership or organization-scoped source rows.

Read paths derive the active organization from the authenticated session membership. The policy/controller tests cover foreign IDs, reader/editor denial, and organization-switch behavior. This is evidence for implemented module boundaries, not a substitute for a future exhaustive negative-access matrix.

## Amounts, units, and currencies

- P04 prices are whole Rial; P05 sales snapshots are whole Toman after explicit price conversion; P08 purchase snapshots are whole Rial.
- P09 journal values and P10 invoice/open-item/treasury/allocation amounts are whole Rial, serialized as exact decimal strings at API boundaries.
- P06/P07/P08 quantities use integer thousandths and base-unit snapshots.
- P12 project purchase cost copies a P08 line's exact line_total_rial once; uniqueness prevents a purchase line from being linked to two projects.
- The focused source scan found no float/double conversion or parseFloat use for money.
- No USD/EUR conversion, exchange-rate history, FX gain/loss, tax engine, project revenue allocation, labor costing, overhead allocation, or reconciled project-profit model was identified.

## Transactions, concurrency, and retries

The reviewed high-integrity paths use database transactions and lock order documented in source/OKF: P06 stock-key locks; P07 order/line/product/location/stock locking; P08 order/line/product/location/stock locking; P09 book/journal/period/sorted-account locking; P10 book before source document/lines/events/open item and the P09 posting path. P07-P10 have idempotency or unique request identities. P12 due reminders are deduplicated by task/assignment version/recipient/due-date identity; project cost uses a unique purchase-line association.

The existing feature suites exercise contention and retry behaviors in their local acceptance history. This P14 run executed the guarded P10 feature suite and full Laravel suite; it did not run separate two-server contention harnesses or mutate development fixtures.

## Financial lifecycle and P10 safety boundary

P09 is a manual synthetic journal engine. Posting requires balanced whole-Rial lines, an open period, a scoped book/account set, and idempotency. Reversal appends a separate journal; it does not rewrite the original. Source-driven P05/P06/P07/P08 posting remains disabled.

P10 is approved only for the local synthetic invoice and settlement paths recorded in ADR-008. The resolver:

1. Requires a whole-Rial IRR book.
2. Requires a profile scoped to the active organization and selected book.
3. Requires every mapped account to belong to that organization/book and be active/postable with the expected category.
4. Accepts synthetic_test only for P10-SYNTH-* books in local or testing.
5. Accepts status approved only when approval_reference, approved_by, and approved_at are present.

The local P10 approval in ADR-008 records organization 1 / legacy-local, book 2 / P10-SYNTH-BROWSER, and an exact synthetic account mapping. Those numeric identities are historical database evidence; this P14 audit did not re-read profile/account rows. No profile was changed. The code does not implement an HTTP approval workflow for production profiles; the approved path is a trust boundary that must be protected by an explicit owner-approved provisioning process before any future deployment.

P10 invoice/settlement behavior is intentionally conservative: customer invoice lines are based on delivered P07 quantities, supplier invoice lines on received P08 quantities, settlement amounts are fully allocated to one invoice and cannot exceed its open balance, and exact retries return existing records. There is no edit/delete/void/coordinated correction or standalone reversal path for P10-linked journals. Do not use P10 for real transactions or infer live approval from local ADR-008.

## Findings and required controls

| ID | Finding | Impact | Recommended control / owner |
|---|---|---|---|
| DB-P14-01 | Current schema and migration ledger are verified, but sanitized table row counts and before/after aggregates were not obtained because db:show --counts failed on missing PHP intl. | Data-preservation evidence is limited to the strict test guard and read-only migration metadata. | Add a safe aggregate-count method in a later audit/operations task; Tech Lead. |
| DB-P14-02 | No contract installment, multi-currency, project revenue allocation, overhead/labor cost, or profitability schema exists. | V2 receivable/profit reports cannot be derived reliably from current P05/P10 sales-order billing and P12 purchase-only cost. | Resolve D03-D06; implement additive models in planned phases. CEO/Finance. |
| DB-P14-03 | P10's production-approved branch is gated by profile metadata, but no application workflow verifies the approval record against a governance decision. | A privileged database/configuration change could activate a profile outside the local synthetic mapping. No current production activation was found. | Keep production disabled; require auditable approval and controlled provisioning before any approved profile. Tech Lead/CEO. |
| DB-P14-04 | P10 correction and refund behavior is intentionally absent. | Posted local P10 invoices and allocations cannot be corrected through a coordinated domain workflow. | Keep closed-period and P10 correction behavior blocked until D04 and a dedicated correction design are approved. CEO/Finance. |
| DB-P14-05 | P05/P08/P09/P10 use different snapshot currencies and business triggers. | Combining them into project profit without currency/recognition decisions risks double-counting and incorrect conversion. | Resolve D04/D05; keep reports explicitly separated until then. Finance/CEO. |

## Validation and data preservation

The test guard was inspected before any test. Migration status was read for both erp_dev and erp_test. P10 tests (4/129) and the full suite (110/1,347) completed with exit code 0 on erp_test. No application migration or development-database write was executed. The exact evidence and command limitations are in evidence/command-results.md.
