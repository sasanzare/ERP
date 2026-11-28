# P14 Evidence Index

This folder stores concise, sanitized command results and browser-attempt details. It contains no secrets, credentials, private customer data, or raw database rows.

| Evidence | Purpose |
|---|---|
| command-results.md | Exact commands, exit codes, test totals, schema/environment identifiers, and disclosed failures. |
| browser-capture.md | Records the authorized current-route screenshot attempt and loopback blocker. |
| SHA256SUMS.txt | SHA-256 checksums for the sanitized evidence index and two evidence files; it excludes itself and the separate worktree manifest. |
| worktree-manifest.txt | Final Git status/path/content-hash manifest and reproducible P14 end-state fingerprint; self-referential content hashes are explicitly excluded. |

No current P14 product screenshot was accepted or saved. Both browser paths showed a connection timeout rather than an ERP screen; this is an environment blocker, not UI evidence. Historical P01-P13 screenshots remain linked from docs/UI_DESIGN.md but were not reused as current audit evidence.
