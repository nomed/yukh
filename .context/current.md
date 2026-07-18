# Current development context

## Active issue

- `#27 Implement connected apply-mode GitHub Action runtime`
- Branch: `feat/issue-27-connected-apply-runtime`

## Implemented

- Authenticated GitHub GraphQL transport with explicit error handling.
- Triggering issue resolution including issue body and node ID.
- Connected Project discovery for identity, fields, options, iterations and observed item state.
- Contract and policy validation followed by desired-state construction.
- Deterministic complete multi-field planning shared by dry-run and apply.
- Explicit apply gate requiring `mode=apply`, `apply_enabled=true`, and a token.
- Sequential idempotent mutation execution with partial-failure and retry details.
- Step Summary counts for planned, applied and remaining operations.
- Reusable workflow token and permission guidance for repository, organization and user Projects.
- Automated tests for transport, dry-run no-write, apply, repeated no-op, permissions and partial failure.

## Deliberately deferred

- Marketplace publication, immutable version tags and first UC Rust adoption remain in #13.
- Cross-repository relationships and architecture-record semantics remain out of scope.
