# Current development context

## Active issue

- `#25 Implement safe dry-run GitHub Action runtime foundation`
- Branch: `feat/issue-25-github-action-runtime`

## Implemented

- Safe runtime input validation for repository, issue, Project, policy and mode.
- Dry-run as the default mode with fail-closed apply gates.
- Deterministic read-only reconciliation execution from issue events or manual inputs.
- Human-readable, JSON and GitHub Step Summary output.
- Composite `action.yml` entry point.
- Reusable workflow with manual dispatch, least-privilege read permissions and per-issue concurrency.
- Automated tests for validation, apply safety, deterministic output, diagnostics and no-drift summaries.

## Deliberately deferred

- Connected apply-mode GraphQL transport and write execution require a follow-up child under #6.
- Versioned publication, Marketplace packaging and first UC Rust adoption remain in #13.
