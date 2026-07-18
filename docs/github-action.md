# GitHub Action runtime

Yukh runs in `dry-run` mode by default. The runtime validates the issue contract and repository policy, builds a deterministic desired-versus-observed report, writes a concise GitHub Step Summary, and performs no GitHub mutation.

## Reusable workflow

```yaml
name: Reconcile issue

on:
  issues:
    types: [opened, edited, reopened]

jobs:
  yukh:
    uses: nomed/yukh/.github/workflows/yukh-reconcile.yml@main
    with:
      issue_number: ${{ github.event.issue.number }}
      project_number: 1
      mode: dry-run
```

The reusable workflow uses read-only permissions:

```yaml
permissions:
  contents: read
  issues: read
```

Runs are serialized by repository and issue number, so repeated issue events cannot execute conflicting reconciliation concurrently.

## Manual execution

Open **Actions → Yukh reusable reconciliation → Run workflow**, provide the issue and Project numbers, and leave mode as `dry-run`.

## Apply safety

The runtime fails closed when `apply` is requested unless both conditions are present:

1. `apply_enabled=true`;
2. a GitHub token is available.

Connected write execution is intentionally deferred to a separate runtime child issue. Enabling the gate alone does not silently grant mutation behavior.

## Outputs

Every run prints:

- a human-readable report;
- deterministic JSON;
- a GitHub Step Summary containing issue, mode, status, planned changes, warnings, and actionable diagnostics.

## Troubleshooting

- `invalid_repository`: use `owner/name` format.
- `invalid_issue_number` or `invalid_project_number`: provide a positive integer.
- `missing_policy`: ensure `.yukh/project.yaml` exists or set `policy_path`.
- `apply_not_enabled`: use dry-run, or explicitly enable apply after the connected write runtime is installed.
- `apply_token_missing`: configure a token with the permissions required by the future apply runtime.
