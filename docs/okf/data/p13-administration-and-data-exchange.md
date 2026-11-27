---
type: Data Model
title: P13 Role Administration and Party Import Records
description: Records the explicit local role-manager grants and resumable organization-scoped party import outcomes.
tags:
  - data-model
  - administration
  - imports
  - organization
status: accepted
---

# P13 Role Administration and Party Import Records

## Role-manager grants

Migration `2026_11_26_000014_create_p13_admin_exchange_tables` adds `organization_role_managers` with `organization_id`, `user_id`, optional grantor, source, and timestamps. The unique `(organization_id, user_id)` key prevents duplicate grants. Its composite foreign key to `organization_memberships(organization_id, user_id)` prevents a grant for a user who is not a member of that organization. The grant is independent from the member's `reader`/`editor` field.

The grant table currently has no web write route. Local/testing CLI provisioning records a grant; revocation is allowed only while another grant remains. Membership role edits continue to append `organization_role_audits` with membership, actor/source, previous/new role, and timestamp.

## Import requests and row outcomes

`party_imports` stores organization, import UUID key, normalized payload SHA-256, initial source format, status, creator, and timestamps. Unique `(organization_id, import_key)` makes request identity organization-scoped. `party_import_rows` stores the source row/party ID, normalized code/name/roles, preview classification, durable outcome/message, and resulting party ID. Each request/source-row pair is unique and the composite organization/request foreign key prevents crossing organizations.

Preview writes no import request or row result. Apply creates the request and every row record in one initialization transaction. Preview `valid` rows enter `pending`; preview `duplicate` and `invalid` rows preserve their outcome. Each pending row then creates its party, one or two `party_roles`, and its `created` outcome in the same row transaction. A database uniqueness race rolls back the row insert and stores a `duplicate` result. If the process stops between rows, already committed outcomes remain and pending rows resume on the same key and payload.

The payload hash covers organization identity, source row order, informational party ID, code/name/role input, and text/extra-column normalization flags. It does not include CSV versus XLSX container format or the database-dependent preview classification, so equivalent normalized files share a hash while existing-data changes between preview and apply are rechecked.

## Party register and output

P13 reuses the P04 `parties` and `party_roles` tables. One party ID continues to support both `customer` and `supplier`. The database's unique `(organization_id, code)` index and configured column collation determine duplicate equality; no new code-normalization rule replaces that constraint.

The export is a stream of stable-ordered rows with `party_id`, `party_code`, `display_name`, and pipe-joined roles. Formula-like text is apostrophe-prefixed in the CSV output; ordinary code strings including leading-zero values are serialized without numeric conversion.

See the [P13 architecture](../architecture/p13-administration-and-data-exchange.md), [P13 security rules](../security/p13-administration-and-data-exchange.md), and [P04 master-data model](master-data.md).
