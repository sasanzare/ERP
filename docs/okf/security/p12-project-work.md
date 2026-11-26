---
type: Security Model
title: P12 Project Work Access Boundaries
description: Defines member/editor access, parent scoping, assignment checks, reminder privacy, and purchase-line association controls.
tags:
  - security
  - project-work
  - authorization
  - organization
status: active
---

# P12 Project Work Access Boundaries

## Session, organization, and roles

P12 routes use Laravel session authentication, `ResolveActiveOrganization`, and the explicit CSRF middleware for writes. The organization is derived from the authenticated session; request bodies cannot override `organization_id`. `viewWork` allows an active organization member to read that organization's projects, tasks, comments, costs, options, and their own inbox. `manageWork` allows only editors to create projects/tasks, change task fields/status, add comments, and associate purchase lines. Policies are enforced on the server even when the UI hides controls.

An assignee must have a membership in the active organization. A member may be assigned regardless of reader/editor role; assignment does not grant write permission. A foreign or unknown assignee is hidden as 404. Parent project and nested task lookups are scoped before writes, preserving 404 parity for foreign and unknown record IDs.

## Parent scoping and comments

Project/task detail, comments, and cost links are resolved through their active-organization parent. Task comments must match both the active project and nested task. Comments store plain text and render through React text nodes, not HTML injection. Readers may view comments but receive 403 for writes. A request with another organization's project, task, or comment parent exposes no content.

## Inbox and reminders

The inbox query is constrained to the signed-in user, active organization, and open/in-progress tasks. The CSRF-protected reminder processor creates only that user's due reminders. A unique persistent identity prevents duplicate delivery after retries or refresh. Completed tasks leave the inbox; reassigned tasks no longer match the previous recipient/version and can produce one reminder for the new assignee. Reminders remain local to the application.

## Purchase-line association

Only an editor can link a purchase line. The server resolves the line in the active organization, then locks its open/closed purchase order before locking the line. A foreign line is 404. The unique project-cost key makes a same-project retry idempotent and a link to another project a 409. P12 reads the existing whole-rial line snapshot and stores it with source labels; it does not mutate P08 purchase/receipt data or any P09/P10 accounting record.

## Related concepts

- [P12 architecture](../architecture/p12-project-work.md)
- [P12 data model](../data/p12-project-work.md)
- [Organization access](organization-access.md)
- [P08 purchase isolation](p08-purchasing.md)
- [P12 UI and acceptance evidence](../../UI_DESIGN.md#p12-projects-and-assigned-work-evidence)
