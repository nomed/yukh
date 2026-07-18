# Current development context

## Active issue

- `#10 Implement read-only Project discovery and observed state`
- Branch: `feat/issue-10-project-discovery`

## Implemented

- Read-only GitHub Project v2 adapter behind an injected GraphQL transport.
- Project resolution for organization-owned and user-owned Projects.
- Normalized Project identity, field definitions, single-select options and iterations.
- Paginated Project field and item discovery.
- Current issue item lookup by repository and issue number.
- Deterministic normalization of text, number, single-select and iteration field values.
- Explicit distinction between a missing Project item and a missing Project.
- Actionable diagnostics for invalid input, missing resources, permission failures and API failures.
- Observed state compatible with the existing read-only reconciliation report.
- Automated tests covering supported discovery, pagination, missing items, user Projects and failures.

## Deliberately deferred

The adapter performs no mutations. Adding Project items and setting fields belong to #11. Native parent/child and dependency observation and reconciliation remain in #12.
