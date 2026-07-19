# GitHub Action runtime

Yukh runs in `dry-run` mode by default. The connected runtime resolves the issue and GitHub Project through GraphQL, validates the contract and policy, discovers observed state, builds a deterministic reconciliation plan, and writes a concise GitHub Step Summary.

Yukh publishes `latest`, `vX`, `vX.Y`, and full `vX.Y.Z` tags. Use a full semantic-version tag or commit SHA for immutable pinning.

## Direct composite action

The direct action is the simplest and most explicit integration:

```yaml
name: Reconcile issue

on:
  issues:
    types: [opened, edited, reopened]

permissions:
  contents: read
  issues: read

jobs:
  yukh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: nomed/yukh@v0.2.1
        with:
          issue-number: ${{ github.event.issue.number }}
          project-number: ${{ vars.YUKH_PROJECT_NUMBER }}
          policy-path: .yukh/project.yaml
          mode: dry-run
```

## Reusable workflow

A pinned reusable workflow is also available:

```yaml
jobs:
  yukh:
    uses: nomed/yukh/.github/workflows/yukh-reconcile.yml@v0.2.1
    with:
      issue_number: ${{ github.event.issue.number }}
      project_number: 5
      mode: dry-run
```

Runs are serialized by repository and issue number.

## Apply mode

Apply is opt-in and requires both `mode: apply` and `apply-enabled: true`, together with a dedicated token that can access the target Project.

```yaml
permissions:
  contents: read
  issues: read

jobs:
  yukh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: nomed/yukh@v0.2.1
        with:
          issue-number: ${{ inputs.issue_number }}
          project-number: ${{ vars.YUKH_PROJECT_NUMBER }}
          policy-path: .yukh/project.yaml
          mode: apply
          apply-enabled: true
          github-token: ${{ secrets.YUKH_PROJECT_TOKEN }}
```

The default `GITHUB_TOKEN` remains read-only. User- or organization-owned Projects generally require a GitHub App installation token or narrowly scoped fine-grained PAT with explicit Project access.

Apply resolves the issue, discovers fields, options, iterations and existing membership, then applies only drift. A repeated apply against matching state performs no writes.

## Public and private action repositories

For public Yukh, enable Actions in the consumer and allow the chosen `nomed/yukh` release ref. If Yukh is private, configure Action access for the intended repositories or organization and ensure the consumer permits the private action. Cross-account private reuse depends on GitHub plan and account topology.

See [Packaging, releases, and adoption](packaging-and-releases.md) for settings, upgrade, rollback, and removal guidance.

## Outputs

Every run prints human-readable and JSON output and writes a Step Summary containing issue, mode, planned/applied/remaining operation counts, retryability, status, and diagnostics.

## Failure and retry behavior

Mutations run sequentially. On partial failure, the result preserves completed and ordered remaining operations. Re-running is safe because discovery and planning are repeated before writes.

## Troubleshooting

- `invalid_repository`: use `owner/name` format.
- `invalid_issue_number` or `invalid_project_number`: provide a positive integer.
- `missing_policy`: ensure `.yukh/project.yaml` exists or set `policy-path`.
- `apply_not_enabled`: set both `mode: apply` and `apply-enabled: true`.
- `apply_token_missing` or `github_token_missing`: pass a token.
- `github_permission_denied` or `project_permission_denied`: grant access to the issue repository and target Project.
- `project_mutation_permission_denied`: use a Project-capable token.