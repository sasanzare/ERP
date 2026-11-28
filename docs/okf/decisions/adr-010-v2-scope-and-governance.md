---
type: Decision
title: ADR-010 V2 Scope and Governance
description: Records the CEO-approved internal NoSyntax ERP V2 scope, modular-monolith direction, phase authority, and preserved production and Git safety boundaries.
tags:
  - decision
  - v2
  - scope
  - governance
  - security
status: accepted
---

# ADR-010: V2 Scope and Governance

## Status

Accepted for V2 development scope by the CEO / Project Owner on 2026-11-28, based on the explicit owner directive supplied for P14 final acceptance and D01 approval. This decision is D01 only. D02-D14 remain open.

The directive names docs/MASTER_PLAN_V2.md as the governing plan, but that path is absent in this repository. The V2 plan present and reviewed is docs/NoSyntax_ERP_MASTER_PLAN_V2_FA.md. This ADR records the approval against that existing V2 plan content; it does not rename the file, create a duplicate plan, or alter its contents.

## Context

The local ERP prototype has accepted P01-P13 at their documented local boundaries. The accepted modules include identity and organization access, master data, goods CRM/sales, inventory/fulfillment, procurement, local synthetic accounting/settlement, read-only reporting, project work, and role administration/party exchange.

The owner-approved V2 direction is an internal, project-centric ERP for NoSyntax, a software development and digital services company. The future customer portal is a separate release milestone after successful internal ERP acceptance.

P14 audited the current application and found partial or missing support for contracts/installments, approved project-phase progress, time/capacity, managerial payroll, profitability, general documents/backup, and granular role access. This ADR approves the development direction and governance boundary, not every proposed business rule, formula, architecture detail, or future phase acceptance criterion in the V2 plan.

## Decision

1. The existing application and P01-P13 history remain the foundation; preserve reusable modules, historical behavior, and existing business data.
2. The Modular Monolith is the approved architectural direction.
3. Retain Laravel, React, TypeScript, and MariaDB unless a later explicitly approved ADR justifies a change.
4. Preserve procurement, inventory, goods sales, and accounting modules. A later authorized phase may hide or disable nonessential modules through controlled mechanisms.
5. Work proceeds one explicitly authorized phase at a time. This ADR closes the P14 D01 decision; it does not authorize starting P15 or any later phase.
6. Future phases may change application code, tests, and schemas only within their individually authorized scope and acceptance criteria. Migrations require compatibility checks and a documented rollback/recovery procedure.
7. No destructive database operations, persistent data reset, or unauthorized deletion is approved.
8. P09/P10 financial posting restrictions remain in force until a relevant later phase establishes and validates a separately approved safe alternative. ADR-008 remains the authority for the exact local synthetic P10 paths. No real production posting is approved here.
9. Production deployment, production database access, real financial posting, customer portal exposure, and external-service integrations remain prohibited until separately approved and validated.
10. Local working-tree modifications within an authorized phase are permitted. Staging, commits, pushes, branch creation/switching, history rewrites, and destructive Git operations still require separate explicit authorization.
11. P14 must remain evidence-based: limitations, failed/unavailable checks, and unresolved owner decisions remain visible. This decision does not remove those findings.

## Approval record

| Field | Record |
|---|---|
| Decision | D01 |
| Status | APPROVED |
| Approver | CEO / Project Owner |
| Approval date | 2026-11-28 |
| Approval source | Explicit user-supplied CEO owner directive for P14 final acceptance and D01 approval |
| Approved scope | Internal, project-centric NoSyntax ERP V2 development; Modular Monolith; existing stack; separate customer-portal milestone after internal acceptance; one authorized phase at a time |
| Git authorization | Local working-tree edits within an authorized phase are permitted. Staging, commit, push, branch/history operations, and destructive Git operations require separate explicit approval. |
| Remaining restrictions | No production deployment/database access/real posting, external services, customer-portal exposure, destructive data reset/deletion, or P15 start without its own execution authorization. Preserve ADR-008 P10 limits. |
| Related ADRs | ADR-001 stack/isolation; ADR-008 accounting/P10 boundary; ADR-009 role-manager boundary |
| Other decisions | D02-D14 remain OPEN |

The approval directive names the CEO as approver for D01. No separate approval or concurrence by another role is represented by this record.

## Consequences

- P14 AC-P14-04 is satisfied by the explicit CEO scope/Git approval and this recorded decision.
- The approved V2 content now governs future V2 phase planning, while docs/MASTER_PLAN.md remains the historical P01-P13 plan.
- P15 is ready for a future execution request only after its exact scope/acceptance criteria are reviewed; this ADR itself does not start P15.
- D02-D14 block the affected authorization, financial, HR, localization, capacity, storage, KPI, cutover, customer-acceptance, and service-catalog decisions until their planned gates.
- P14's current-browser, Pint, PHP intl, dependency-audit, backup/restore, staging, and load-test limitations remain findings. D01 approval does not turn them into passing evidence or production readiness.

## References

- [Approved V2 plan currently present](../../NoSyntax_ERP_MASTER_PLAN_V2_FA.md)
- [P14 acceptance report](../../acceptance/v2/P14/report.md)
- [D01-D14 decision register](../../acceptance/v2/P14/DECISION_REGISTER.md)
- [ADR-008 P09/P10 scope and posting decisions](adr-008-p09-accounting-scope-and-posting-decisions.md)
- [ADR-009 P13 role-manager decision](adr-009-p13-role-management.md)
