# V2 Business and Technical Gap Analysis

## Scope and interpretation

This comparison treats the answered Q01-Q54 questionnaire as the owner input and the V2 plan as the approved scope/phase reference following D01 approval recorded in ADR-010. A phase assignment or a formula marked E/D in V2 remains a proposal unless separately approved by its applicable decision gate. Current implementation evidence and status are in the [traceability matrix](REQUIREMENTS_TRACEABILITY_MATRIX.md) and [machine-readable RTM](requirements_traceability.json).

Current classifications: 1 VERIFIED, 35 PARTIAL, 14 MISSING, 2 UNVERIFIED, and 2 OUT_OF_SCOPE. VERIFIED means the specific stated requirement has supporting current evidence; it does not mean the V2 product is ready. No production readiness conclusion is drawn.

## Reuse before new implementation

| Existing capability | Current boundary | Reuse for V2 |
|---|---|---|
| P03 identity and organization access | Session/password auth, active organization, fixed editor/reader roles | Keep the membership and tenant boundary; extend only after D02/D09. |
| P04 master data | Parties with customer/supplier roles, products, units, warehouses, locations, selected Rial price lists | Reuse shared parties and existing organization-scoped references for CRM and contract work. |
| P05 CRM/sales | Lead, dated follow-up, quote, exact Toman line snapshots, confirmed order | Reuse lead/customer/quote concepts; do not treat sales orders as service contracts. |
| P06/P07 inventory and fulfillment | Stock ledger, reservations, delivery and remainder cancellation | Preserve as optional goods workflow; do not make it a prerequisite for service projects. |
| P08 purchasing | Request, independent approval, supplier order, exact Rial snapshots, receipt | Reuse source purchase lines for project costs; preserve existing approvals and source records. |
| P09/P10 financial engine | Manual synthetic journals; separately approved local synthetic invoices and settlements | Keep the current posting boundary. V2 managerial finance needs its own approved model and must not enable live posting implicitly. |
| P11 reporting | Read-only as-of dashboard and drill-down | Reuse the read-only reporting pattern and exact-unit conventions. |
| P12 work management | Organization-scoped projects, tasks, assignees, comments, due inbox, one P08 cost association | Extend the existing work module into phases/progress; do not create a second project/task subsystem. |
| P13 administration/exchange | Separate role-manager grant, role history, create-only party import, filtered party CSV export | Reuse admin audits and parser safeguards; do not treat role_manager as a PM/Finance/HR authorization model. |

## Business workflow gaps

### Customer, service, and contract lifecycle — P20-P24

P05 already provides useful CRM and goods-quote building blocks. The app lacks configurable service catalog entries, service stages, contact representatives, contract terms/templates, signed contract versions, amendments, pricing models for services, and a contract-to-project relationship. The customer/prospect can be a Party, but a party record is not a complete customer relationship or contract record. These are P1 gaps for the stated NoSyntax daily workflow. D03, D04, D07, D10, D13, and D14 constrain their design.

### Projects, phases, progress, and acceptance — P24-P27, P41

P12 is the reusable project/task substrate. It has project records and assigned tasks with open/in-progress/completed states, due dates, comments, an inbox, and task counts. It has no project phase hierarchy, milestones/sprints, dependency graph, approved weighted progress, project pause/cancel/closure approval, customer acceptance, or versioned Markdown masterplan. Its current progress summary is task-count based, not a business-approved project-progress record. Do not add a parallel project/task model.

### People, time, and capacity — P28-P29, P32

No employee profile, attendance/leave, timesheet, timer, approved hours, hourly labor cost, capacity calculation, or payroll data model was found. P12 assignees are user accounts; this does not constitute HR or compensation data. These requirements require D06 and sensitive-field decisions before implementation.

### Receivables, expenses, managerial finance, and profitability — P19, P30-P33, P37

P10 provides customer/supplier invoices and settlements for confirmed P05/P08 documents under the local synthetic approval in ADR-008. P12 stores one immutable P08 purchase-line cost snapshot per project. Neither is a contract installment ledger, project revenue allocation, labor/overhead cost model, refund/correction process, or project profitability calculation. P09 remains a manual whole-Rial ledger and does not automatically recognize sales, inventory, purchases, or receipts. P11 is read-only and currently reports existing ERP domains; it does not create managerial postings.

The accounting and managerial-finance boundary is safety critical. Resolve D04/D05/D06 and retain ADR-008's local-only synthetic posting constraints before changing financial behavior.

### Documents, knowledge, and support — P21, P25, P35-P36, P38

P13's CSV/XLSX upload is a bounded party-import path, not general document storage. No contract files, versioned attachments, digital assets, Drive links, project knowledge repository, ticketing, general audit log, or full portable export package was found. P12 comments are the only general project collaboration primitive identified.

### Dashboards, notifications, and customer portal — P34-P46

P11 is useful read-only reporting. P12 materializes local task-due reminders on the signed-in user's inbox request. There is no cross-domain notification service or role-specific NoSyntax executive dashboard. Customer portal requirements are explicitly deferred to P42-P46; there is no customer-facing route in P01-P13.

### Security and operational readiness — P14, P16-P18, P39-P46

The current internal surface is authenticated and organization scoped, with explicit CSRF for mutations and test-database guards. The fixed role model is not the requested PM/Finance/HR/customer field-level matrix. Google login, MFA policy, account recovery, offboarding, generalized audit logging, backup/restore, staging, load testing, monitoring, and release/rollback evidence remain absent or unverified.

## Gap priority

| Priority | Gap group | Business consequence | Proposed target |
|---|---|---|---|
| P1 | Service/contract lifecycle and installment receivables | The customer-to-contract-to-project lifecycle cannot yet be managed end to end. | P20-P24, P30 |
| P1 | Phase hierarchy and approved progress | Project status cannot yet reflect owner-approved phase completion. | P24-P27 |
| P1 | Managerial finance boundary, labor costs, and profit | Current ledger/settlements cannot establish NoSyntax project profitability or payroll. | P19, P28-P33, P37 |
| P1 | Granular access, offboarding, and operational recovery | Current fixed roles and local setup are insufficient evidence for broader internal or portal access. | P16-P18, P39-P46 |
| P1 | Capacity and hosting | The 100-staff/200-concurrent targets are not supported by measured evidence. | D08, P40/P46 |
| P2 | Documents, knowledge, search, reporting exports, and support | Staff would need parallel tools for common project records and customer support. | P21, P25, P35-P38 |
| P2 | Workspace navigation and module activation | The shell remains goods/phase-oriented and exposes optional modules without a V2 visibility registry. | P15, P18, P27 |
| P3 | Customer portal and external integrations | Correctly deferred until internal ERP acceptance and separate approval. | P42-P46 |

## Engineering proposals not established as owner decisions

ADR-010 approves the Modular Monolith direction and bounded internal V2 scope. The V2 plan also proposes specific logical models, exact progress formulas, NFR thresholds, workload scenarios, RPO/RTO, hosting approaches, and phase boundaries; these remain subject to the applicable decision gates. D02-D14 remain OPEN in the [Decision Register](DECISION_REGISTER.md).

## Next engineering action after P14

D01 and the P14 governance gate are resolved. P15 is ready but not started; await a separate explicit execution instruction. Keep the accepted P01-P13 modules and data intact, define module visibility/activation around existing routes, and preserve the P09/P10 financial guardrails.
