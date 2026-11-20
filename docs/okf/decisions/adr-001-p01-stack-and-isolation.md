---
type: Architecture Decision
title: P01 Stack and Database Isolation
description: Records the user-selected Laravel release and P01 local runtime and test isolation choices.
tags:
  - decision
  - runtime
  - database
status: accepted
---

# P01 Stack and Database Isolation

## Decision

- Use the latest Laravel release requested by the user: Laravel 13 with host PHP 8.5.13.
- Use React/React DOM 19.3.1, TypeScript 5.9.3, Vite 8.3.8, and `@vitejs/plugin-react` 5.2.0 under `resources/js/`.
- Configure the official MariaDB image `mariadb:11.8.9-noble` in root Compose, loopback-bound at a configurable host port defaulting to 3307.
- Use separate schema-scoped development and test accounts. Tests may use only MariaDB schema `erp_test`; the test guard rejects other targets before destructive helpers execute.
- Keep runtime credentials and `APP_KEY` in ignored local `.env` and `.env.testing` files.

## Rationale

Laravel 13 is the current release and requires PHP 8.3 or newer; PHP 8.5.13 is installed locally. The selected React/Vite versions match the available Node.js 26.13.1. MariaDB 11.8 is an LTS series and the patch-specific image tag pins the configured database. Separate schema grants and the pre-test guard protect development data from test helpers.

## Validation State

Composer/npm locks are present. MariaDB 11.8.9 health, schema grants, product ID 1 persistence after restart, HTTP 200, desktop/mobile browser layout, fallback, and MariaDB-backed tests were verified. TypeScript and production build passed. Docker commands on this host require an elevated PowerShell. See [current architecture](../architecture/current-architecture.md) and [HANDOFF](../../../HANDOFF.md).

## References

- [Laravel 13 releases and PHP support](https://laravel.com/framework/docs/13.x/releases)
- [PHP supported versions](https://www.php.net/supported-versions.php)
- [React versions](https://react.dev/versions)
- [Vite compatibility](https://vite.dev/guide/)
- [MariaDB maintenance policy](https://mariadb.org/about/)
- [Official MariaDB image tags](https://hub.docker.com/_/mariadb/tags/)
