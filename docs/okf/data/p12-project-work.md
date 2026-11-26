---
type: Data Model
title: P12 Project Work Records
description: Records projects, tasks, comments, deduplicated due reminders, and immutable links to P08 purchase lines.
tags:
  - data-model
  - project-work
  - reminders
status: active
---

# P12 Project Work Records

## Projects and tasks

Migration `2026_11_26_000013_create_project_work_tables` adds `work_projects`, `work_tasks`, `work_comments`, `work_task_reminders`, and `project_purchase_costs`; it does not alter earlier tables.

`work_projects` stores `organization_id`, title, optional description, creator, and timestamps. `work_tasks` stores its organization/project, title, status, nullable `due_on DATE`, nullable assignee, `assignment_version`, creator/updater, and nullable completion actor/time. Composite foreign keys keep tasks inside their organization-owned project. Indexes support organization/project/status registers and organization/assignee inbox reads.

The status values are `open`, `in_progress`, and `completed`. `completed_by` and `completed_at` are written together on completion and cleared on reopen. Repeating the current transition does not rewrite completion metadata. Assignment version increments only when the assignee changes.

## Comments

`work_comments` stores `organization_id`, `project_id`, nullable `task_id`, `author_id`, plain-text `body`, and timestamps. A null task ID means a project comment. A non-null task ID is constrained with the same organization and parent project. Application validation limits bodies to 2,000 characters and trims whitespace-only values.

## Due reminders

`work_task_reminders` stores a SHA-256 identity, task/organization, recipient, assignment version, reminder type, `due_on_snapshot`, delivery time, and timestamps. Unique keys enforce one due reminder for each organization/task/assignment/recipient/due-date identity. The inbox returns a reminder only when the task is still open, still assigned to that user at the same assignment version, and still has the snapshotted due date. The current `config('app.timezone')` is `UTC`; due is active from 00:00 on `due_on`, while overdue is true only after that date ends.

## Committed purchase costs

`project_purchase_costs` stores organization/project/order/line IDs, whole-rial `amount_rial`, source order/supplier/product/unit label snapshots, linker, link time, and timestamps. Foreign keys scope the project, purchase order, and purchase line to one organization. A unique `(organization_id, purchase_order_line_id)` key prevents a P08 line from being associated with multiple projects. The amount is copied from the existing purchase line's whole-rial `line_total_rial` once. Project totals are serialized as exact strings.

## Related concepts

- [P12 architecture](../architecture/p12-project-work.md)
- [P08 purchase data](p08-purchasing.md)
- [P06 stock ledger](p06-stock-balances.md)
- [P12 access rules](../security/p12-project-work.md)
- [P12 implementation and validation](../../../HANDOFF.md)
