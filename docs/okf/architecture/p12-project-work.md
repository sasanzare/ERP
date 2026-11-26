---
type: Architecture
title: P12 Projects and Assigned Work
description: Defines organization-scoped projects, tasks, comments, inbox reminders, and traceable purchase-line costs.
tags:
  - architecture
  - project-work
  - organization
status: active
---

# P12 Projects and Assigned Work

## Scope and routes

P12 adds local project work on the existing Laravel session, active-organization, explicit-CSRF, and Persian RTL workspace foundations. Projects own tasks. Each task belongs to one project and may have a date-only due date and one organization member as assignee. Project and task comments are plain text. Project costs link to existing P08 purchase-order lines.

The browser routes are `/projects`, `/projects/{project}`, `/projects/{project}/tasks/{task}`, and `/inbox`. The same-origin API provides searchable project summaries, project/task detail, project/task creation and management, comments, purchase-line association, and the assigned user's inbox. Board and list views render the same project task collection.

## Status and counts

Tasks use `open`, `in_progress`, and `completed` states. The API permits `open → in_progress`, `open → completed`, `in_progress → open`, `in_progress → completed`, and `completed → open`; requesting the current state is a no-op. Completing stores `completed_by` and `completed_at`. Reopening clears both fields, and a later completion records the new actor/time.

Project status counts are derived from the same task set used by the board/list. `open_total` counts both open and in-progress tasks. A task is overdue when it is not completed and its due date is earlier than today's date in `config('app.timezone')`. The due date is a `DATE`, so the current date remains due through the end of that configured day.

## Local reminders and inbox

The inbox lists open and in-progress tasks assigned to the signed-in member in the active organization. On inbox entry, the UI posts to `/api/v1/work/inbox/process-due-reminders`, then reads `/api/v1/work/inbox`. A reminder becomes due at the start of its date in the configured application timezone. The current repository configuration is UTC.

Reminder processing is local and synchronous; it uses no mail, external service, or queue worker. A persistent SHA-256 identity and unique database key make repeated processing safe. The identity includes organization, task, current assignment version, recipient, reminder type, and due-date snapshot. Completion hides the task/reminder from the active inbox. Reassignment increments the task assignment version, so an old reminder is no longer delivered to the previous member; the new assignee can receive one reminder if the task is due. A due-date change has its own reminder identity.

## Purchase-line trace

An editor may associate an eligible open or closed P08 order line with a project. Each line can belong to at most one project. P12 snapshots the line's whole-rial `line_total_rial` and the source order/product/supplier/unit labels at association time. The committed purchase total sums those integer strings without floating-point arithmetic. A stable order/line URL opens the corresponding P08 source row. The association does not change the purchase order, receipt, stock ledger, or P10 posting state.

## Related concepts

- [P12 data model](../data/p12-project-work.md)
- [P12 access rules](../security/p12-project-work.md)
- [Organization access](../security/organization-access.md)
- [P08 purchasing](p08-purchasing.md)
- [P08 data model](../data/p08-purchasing.md)
- [P12 UI and Chrome evidence](../../UI_DESIGN.md#p12-projects-and-assigned-work-evidence)
- [Project handoff](../../../HANDOFF.md)
