# GitHub Action runtime

Yukh runs in `dry-run` mode by default. The connected runtime resolves the issue and GitHub Project through GraphQL, validates the contract and policy, discovers observed state, builds a deterministic reconciliation plan, and writes a concise GitHub Step Summary.

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

Runs are serialized by repository and issue number, so repeated issue events do not execute conflicting reconciliation concurrently.

## Dry-run permissions

A caller that only performs dry-run should grant:

```yaml
permissions:
  contents: read
  issues: read
  repository-projects: read
```

Dry-run performs issue lookup, Project discovery, planning, and reporting. It performs no GraphQL mutation.

## Apply mode

Apply is opt-in and requires both `mode: apply` and `apply_enabled: true`.

```yaml
jobs:
  yukh:
    uses: nomed/yukh/.github/workflows/yukh-reconcile.yml@main
    with:
      issue_number: ${{ github.event.issue.number }}
      project_number: 1
      mode: apply
      apply_enabled: true
    secrets:
      yukh_token: ${{ secrets.YUKH_PROJECT_TOKEN }}
```

For repository Projects, grant `repository-projects: write`. Organization or user Projects generally require a GitHub App installation token or fine-grained PAT with explicit access to the target Project, passed as `yukh_token`.

Apply resolves the issue node ID, discovers fields/options/iterations and the existing Project item, produces the same deterministic plan as dry-run, and then applies only drifted operations. A repeated apply against matching observed state performs no writes.

## Outputs

Every run prints human-readable and JSON output and writes a Step Summary containing issue, mode, planned/applied/remaining operation counts, retryability, status, and diagnostics.

## Failure and retry behavior

Mutations run sequentially. On partial failure, the result preserves the number of completed operations and the ordered remaining work. Re-running is safe because discovery and planning are repeated before writes.

## Troubleshooting

- `invalid_repository`: use `owner/name` format.
- `invalid_issue_number` or `invalid_project_number`: provide a positive integer.
- `missing_policy`: ensure `.yukh/project.yaml` exists or set `policy_path`.
- `apply_not_enabled`: set both `mode: apply` and `apply_enabled: true`.
- `apply_token_missing` or `github_token_missing`: pass a token.
- `github_permission_denied` or `project_permission_denied`: grant the token access to the issue repository and target Project.
- `project_mutation_permission_denied`: use a write-capable token; the default `GITHUB_TOKEN` may not reach organization or user Projects.
