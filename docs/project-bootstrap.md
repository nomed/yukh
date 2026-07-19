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

Yukh never deletes fields or options. Before apply, discovery classifies every same-name existing field. Only fields proven to be editable custom Project fields may be updated. Fields derived from issues or pull requests, and fields whose mutability is ambiguous, invalidate the complete plan before any mutation runs.

A diagnostic such as `non_custom_project_field` means the policy must map to a dedicated custom field, for example `Work Priority` rather than a GitHub-derived `Priority` field. A same-name custom field with an incompatible type also fails closed.

All predictable validation completes before apply begins. Unexpected API failures can still leave already-completed operations, and Yukh reports the ordered remaining operations for a safe retry.

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

Use the latest verified patch release containing the non-custom field preflight before running apply against a Project that exposes issue-derived fields.