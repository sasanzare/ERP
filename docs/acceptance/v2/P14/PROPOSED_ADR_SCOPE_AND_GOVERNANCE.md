# Proposed ADR — V2 Scope and Governance

## Status

Superseded by accepted canonical [ADR-010](../../../okf/decisions/adr-010-v2-scope-and-governance.md), approved by the CEO / Project Owner on 2026-11-28. This preserved proposal remains as the P14 review artifact; it is not the governing decision record.

## Approval result

D01 was explicitly approved in the owner directive. The approved scope is recorded in ADR-010 and DECISION_REGISTER.md. D02-D14 remain open. The exact English plan path named by the directive, docs/MASTER_PLAN_V2.md, is absent; the available V2 source is docs/NoSyntax_ERP_MASTER_PLAN_V2_FA.md. No copy or rename was made.

## Context

The current repository instructions define a local-development-only prototype, preserve P01-P13, keep P10 limited to ADR-008's approved local synthetic invoice/settlement paths, prohibit deployment/external integrations, and prohibit staging/commit/push/branch changes without explicit authorization. The user-provided V2 plan proposes a project-centric internal ERP followed later by a separate customer portal. The plan and answered questionnaire are untracked user-provided files; their presence is not an approval of architecture, financial, security, production, or Git-policy changes.

At the time this proposal was drafted, P14 had not yet recorded the CEO's D01 approval. The current acceptance status and decision are in the P14 report and canonical ADR-010. The P14 audit found that the current application is a useful local ERP prototype with reusable P01-P13 modules, but does not yet implement contracts/installments, project phases/approved progress, time/capacity, managerial payroll, project profitability, general documents/backup, or the V2 authorization matrix.

## Proposed decision for owner review

1. Keep the current codebase and accepted P01-P13 modules. Continue with a modular-monolith direction unless a later approved ADR establishes another need.
2. Treat P15-P39 as internal-ERP development only, with synthetic/test data during implementation. Keep P09 manual accounting and P10 local synthetic posting rules intact until each relevant financial decision is separately approved.
3. Keep production deployment, live financial posting, customer portal exposure, Google/OAuth integrations, external services, and data migration out of scope until their named gates and explicit owner approvals.
4. Keep the current Git rules: no stage, commit, push, branch switch, reset, rebase, or destructive cleanup without explicit authorization. Any requested override must name the operation and scope.
5. Require one phase at a time, code/schema/source evidence, guarded isolated tests, documented rollback/recovery, and status PARTIAL/BLOCKED when evidence is unavailable.
6. Require D01 approval before P15. Resolve D02-D14 before the phase that depends on each decision; never treat an engineering recommendation as an owner decision.

## Options

| Option | Benefits | Trade-offs |
|---|---|---|
| A. Approve the bounded local internal-ERP direction above (recommended) | Allows incremental P15 work while preserving the accepted prototype and current safety boundary. | Requires owner decisions before risky or domain-sensitive features; does not create production authority. |
| B. Keep the current P01-P13 scope and do not authorize V2 | No additional architecture or product scope is introduced. | The V2 questionnaire remains an unapproved proposal and P15 cannot start. |
| C. Explicitly propose different scope/Git rules | Allows a different product direction. | Requires a replacement decision with specific boundaries and owner/phase approvals; no implementation may infer the change. |

## Consequences if Option A is approved

- Existing modules remain preserved and can be reused behind an owner-approved navigation/activation plan.
- Internal ERP acceptance and customer-portal acceptance remain separate gates.
- Local P10 approval remains exactly as recorded in ADR-008; no live profile or real transaction is authorized by this proposal.
- D02/D04/D05/D06/D08/D09/D10/D12/D13 decisions continue to block affected implementation/release work until resolved.
- At draft time the P14 report remained PARTIAL pending approval. It has since closed as PASS after D01 approval; that approval does not retroactively establish browser/load/backup evidence.

## Owner approval record

CEO decision: Approved as D01; see canonical ADR-010.
Approved scope: Internal, project-centric V2 development within the boundaries stated in ADR-010.
Approved Git rules/overrides: Local edits within individually authorized phases; restricted Git operations still require separate approval. No overrides to production/data safety restrictions.
Approval date/reference: 2026-11-28; explicit owner directive supplied for P14 final acceptance and D01.
