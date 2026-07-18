# Current development context

## Active issue

- `#9 Implement read-only reconciliation report`
- Branch: `feat/issue-9-read-only-report`

## Implemented

- End-to-end read-only pipeline: issue contract parsing, policy loading, desired-state generation and observed-state comparison.
- Versioned deterministic JSON report schema.
- Concise human-readable summaries for no-op, drift, warning and error outcomes.
- Stable ordering for diagnostics, fields, relationships and differences.
- Explicit planned-change records without any GitHub mutation capability.
- Preservation warnings for unmanaged or human-owned Project fields.
- CLI command accepting issue Markdown, policy YAML and optional observed-state JSON.
- Automated tests covering no-op, drift, warnings, invalid contract, invalid policy, stable serialization and relationship normalization.

## Deliberately deferred

Observed state is supplied as normalized JSON in this issue. Live GitHub Project discovery and field reading belong to #10; mutations belong to #11 and relationship application belongs to #12.
