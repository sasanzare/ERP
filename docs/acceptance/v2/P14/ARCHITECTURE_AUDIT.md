# Architecture Audit

## Current architecture

The repository is a local Laravel/React modular monolith. Laravel 13 serves the Blade application shell and a same-origin stateful /api/v1 interface. React/TypeScript screens call those routes. The API group uses web/session middleware, authentication, active-organization resolution, and explicit CSRF protection for mutations. Feature-specific controllers and services use Eloquent models over MariaDB.

~~~mermaid
flowchart LR
  U[Internal employee browser] --> WEB[Laravel web shell and session]
  WEB --> AUTH[Authentication and active organization]
  AUTH --> UI[React and TypeScript screens]
  UI --> API[Same-origin API v1]
  API --> POL[Policies and Gate checks]
  POL --> SVC[Feature services]
  SVC --> ORM[Eloquent models and transactions]
  ORM --> DB[(MariaDB 11.8.9)]
~~~

The application boundary remains local. No deployed customer API, OAuth provider, object store, external queue, staging environment, or production database was found. Compose defines one MariaDB service with a named persistent volume; PHP and Vite run on the Windows host.

## Domain and data flow

~~~mermaid
flowchart TD
  MD[P04 parties, products, units, price lists] --> CRM[P05 leads, quotes, sales orders]
  CRM --> FUL[P06/P07 reservations and deliveries]
  BUY[P08 requests, orders, receipts] --> STOCK[P06 stock operations and balances]
  FUL -. explicit local synthetic invoice path .-> SET[P10 invoices and settlements]
  BUY -. explicit local synthetic invoice path .-> SET
  SET --> LEDGER[P09 balanced journal service]
  LEDGER -. manual synthetic journals only .-> BOOKS[(P09 books and periods)]
  SET --> BOOKS
  FUL --> READ[P11 read-only dashboard]
  BUY --> READ
  SET --> READ
  STOCK --> READ
  WORK[P12 projects, tasks, comments] --> COST[P12 purchase-line cost snapshot]
  BUY --> COST
  ADMIN[P13 role history and party exchange] --> MD
~~~

P05/P06/P07/P08 do not post into P09 automatically. P10 calls P09's balanced posting path only through an organization/book-scoped profile. The approved P10 synthetic_test workflow is local/test only and is not a production approval.

## Existing component inventory and reuse

| Area | Current components | State relevant to V2 |
|---|---|---|
| Authentication/organizations | SessionController, ResolveActiveOrganization, OrganizationPolicy, membership models | Reuse tenant/session boundary; role definitions remain coarse. |
| Master data | Party/Product/Unit/Warehouse/Location/PriceList controllers and models | Reuse shared parties and organization-owned references; a service catalog is a different concept. |
| CRM/sales | Lead, LeadActivity, SalesQuote, SalesOrder services/controllers | Reuse leads and customer context; do not treat a goods quote as a service contract. |
| Inventory/fulfillment | StockService and SalesFulfillmentService | Preserve optional stock and goods-supply modules. |
| Procurement | PurchasingService, request/order/receipt models | Preserve and reuse receipt/source-line references for project costs. |
| Accounting/settlement | AccountingService, P10SettlementService, profile resolver | Preserve current P09/P10 guardrails; no general managerial ledger exists. |
| Reporting | P11DashboardService | Read-only cross-domain pattern; no write side effects in dashboard. |
| Project work | ProjectWorkService, DueReminderService, work models | Reuse for P24-P27; current model has no project phases or approved progress. |
| Administration/exchange | MembershipRoleService, PartyImportService/Parser | Reuse role audit and safe create-only import controls. |

The codebase has feature folders under app/Services and app/Http/Controllers, but no enforced domain-module packaging or dependency-boundary checks were found. P10 deliberately depends on P09 posting and P12 deliberately references P08 purchase-line data. These are concrete reuse points; a second CRM, task, purchasing, inventory, or accounting implementation would duplicate accepted behavior.

## Architecture strengths verified statically

- Same-origin API calls retain Laravel session and CSRF middleware; the route list shows 130 non-vendor routes.
- Active organization is derived from authenticated membership; mutations are gated by fixed domain policies.
- P06/P07/P08/P09/P10 services use transactions, row locks, unique keys, snapshots, or idempotency in their high-integrity paths.
- Monetary boundaries are integer Rial or Toman snapshots; the focused source scan found no floating-point amount conversion.
- P11 is read-only and P12 snapshots one eligible P08 purchase-line cost instead of recalculating historical purchase values.
- Vite builds separate P12/P13 chunks; the current entry bundle was 497.58 kB in the actual build result.

## Technical debt and preparation items

| ID | Evidence/location | Problem and business effect | Severity / likelihood | Remediation proposal | Target / relative effort |
|---|---|---|---|---|---|
| TD-P14-01 | P12 model/controller/service and migration 000013 | Projects have tasks but no phases, approved progress, dependencies, or customer acceptance; executives cannot rely on project state. | P1 / High | Extend the existing P12 aggregate after confirming D03/D11; preserve task records. | P24-P27 / Large |
| TD-P14-02 | OrganizationPolicy.php and MembershipRoleService.php | Fixed editor/reader plus separate role-manager authority cannot represent PM, Finance, HR, executive, or field-level permissions. | P1 / Medium | Define the action/object/field matrix first, then extend the existing policy boundary with negative tests. | P16-P17 / Large |
| TD-P14-03 | P10PostingProfileResolver.php:64-73; ADR-008 | Approved profiles are accepted when approval reference, actor, and timestamp are nonempty; no application approval workflow exists to attest those fields. No production profile is evidenced in this audit, and live posting remains disabled by policy. | P1 before production exposure / Low in current local-only scope | Require an owner-approved, auditable provisioning path and environment-specific release control before deployment. Do not create it in P14. | P19/P40 / Medium |
| TD-P14-04 | WorkspaceShell.tsx:28-69, 192-309; routes/web.php:25-45 | Navigation is grouped by historical phase and exposes goods/inventory/purchase/accounting beside V2 project work; / still selects ProductsScreen. This conflicts with the project-centric daily workflow and optional-module hiding. | P2 / High | Define the internal daily navigation and module-activation policy using existing screens. | P15/P18/P27 / Medium |
| TD-P14-05 | app/Models and migrations 000013-000014 | General employee, contract, document, time, payroll, risk, ticket, and audit-event aggregates are absent; future phases must add only owner-confirmed concepts. | P1 / High | Implement incrementally at planned phases; do not add a generic speculative schema. | P17-P39 / Large |
| TD-P14-06 | compose.yaml and infrastructure inventory | No backup/restore runbook, offsite storage, monitoring, staging, load scenario, or release rollback evidence exists. | P1 before pilot / High | Resolve D08/D10/D12 and validate at P39-P41/P40 on a permitted synthetic environment. | P39-P41 / Large |
| TD-P14-07 | Laravel 13.43.0 dependency | A current upstream high-severity numeric-validation DoS advisory affects versions before 13.44.1. The inspected application source contains no multiple_of or relative numeric comparison rules covered by that advisory, so current exploitability was not established. Full Composer/NPM audit was blocked by DNS. | P1 before network exposure / Conditional | Plan an authorized framework update to at least the patched maintenance version, then run the full regression suite; no dependency was changed in P14. | P15 maintenance slice, before P40 / Medium |
| TD-P14-08 | Requirements matrix and test inventory | Current regression tests cover P01-P13 local behavior but do not prove 200-user capacity, restore, full business acceptance, or external security posture. | P1 before Gate I / High | Add workload, restore, UAT, and security evidence in authorized later phases. | P39-P41 / Large |

No evidence supports a rewrite, microservices split, or framework replacement. The Modular Monolith direction and bounded internal V2 scope are approved in ADR-010. D02-D14 remain open and P15 still awaits separate execution authorization.
