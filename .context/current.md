# Current development context

## Active issue

- `#2 Implement issue contract parser and validator`
- Branch: `feat/issue-2-contract-parser`

## Implemented

- TypeScript contract model and public parser API.
- Exact hidden-block discovery for `<!-- yukh ... -->`.
- Missing, duplicated and unterminated contract diagnostics.
- YAML parsing with duplicate-key rejection.
- Required-key, schema, type, execution-mode and unknown-key validation.
- `x-` extension preservation.
- Deterministic normalization of relationship lists.
- Self-reference validation when the current issue number is available.
- Eleven automated tests covering valid and invalid contracts.

## Deliberately deferred

Policy-specific allowed values, graph cycles, remote issue existence and Project iteration lookup belong to later policy and GitHub adapter work. The parser exposes normalized data and diagnostics for those layers.
