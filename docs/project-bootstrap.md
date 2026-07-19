# GitHub Project bootstrap

Yukh can reconcile the custom GitHub Project schema required by a repository policy before issue reconciliation runs.

The bootstrap operation is intentionally separate from issue reconciliation:

```yaml
- uses: nomed/yukh@v0.3.0
  with:
    operation: bootstrap-project
    project-number: 15
    policy-path: .yukh/project.yaml
    mode: dry-run
    github-token: ${{ secrets.PROJECT_TOKEN }}
```

## Supported schema

Yukh derives supported custom fields from `.yukh/project.yaml`:

- a policy field with mapped values becomes a `SINGLE_SELECT` Project field;
- a policy field with `type: number` becomes a `NUMBER` Project field;
- derived fields, Status, and Iteration are not created;
- string fields without an enum mapping are rejected because their safe Project type cannot be inferred.

Single-select options use deterministic default colors. Existing options keep their identifiers, colors, descriptions, and names. Missing policy options are appended. Unrelated human-created options are preserved.

## Safety

Bootstrap runs in `dry-run` by default. Apply requires all of:

```yaml
operation: bootstrap-project
mode: apply
apply-enabled: true
github-token: ${{ secrets.PROJECT_TOKEN }}
```

Yukh never deletes fields or options. A same-name field with an incompatible data type fails closed. Mutations are ordered and stop on the first failure, returning the remaining operations for a safe retry.

## Idempotency acceptance

After the first apply, run the identical bootstrap again. A converged Project returns:

```json
{
  "status": "success",
  "operation": "bootstrap-project",
  "mode": "apply",
  "applied": 0,
  "remaining": [],
  "diagnostics": []
}
```

## Example controlled workflow

```yaml
name: Bootstrap Yukh Project

on:
  workflow_dispatch:
    inputs:
      confirm_apply:
        type: boolean
        required: true
        default: false

permissions:
  contents: read

jobs:
  bootstrap:
    if: ${{ inputs.confirm_apply }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: nomed/yukh@v0.3.0
        with:
          operation: bootstrap-project
          project-number: ${{ vars.YUKH_PROJECT_NUMBER }}
          policy-path: .yukh/project.yaml
          mode: apply
          apply-enabled: true
          github-token: ${{ secrets.PROJECT_TOKEN }}
```

Use the released version containing this capability rather than the illustrative version above until the release is published.
