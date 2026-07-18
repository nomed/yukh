# Current development context

## Active issue

- `#3 Implement policy loader and desired-state builder`
- Branch: `feat/issue-3-policy-loader`

## Implemented

- Versioned `.yukh/project.yaml` policy with executable field mappings.
- Typed policy model independent from GitHub API access.
- YAML loading with duplicate-key rejection and actionable diagnostics.
- Validation for project identity, contract schema, supported fields, mappings, defaults, scheduling and safety flags.
- Deterministic desired Project state generation from a normalized issue contract.
- Required-field enforcement and policy-specific value validation.
- Milestone mapping, execution defaults and explicit/automatic iteration intent.
- Relationship preservation for parent, children, dependencies and blocks.
- Automated tests for valid policy, malformed policy, invalid mappings, defaults, required values and deterministic UC Rust desired state.

## Deliberately deferred

Observed GitHub Project state, Project/field discovery, remote iteration lookup, issue existence, dependency graph checks and all mutations belong to the Project adapter and reconciliation issues.
