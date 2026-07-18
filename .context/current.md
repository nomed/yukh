# Current development context

## Active issue

- `#19 Implement relationship validation and reconciliation planning`
- Branch: `feat/issue-19-relationship-planning`

## Implemented

- Typed normalized relationship state for parent, children, depends-on and blocks.
- Deterministic add/remove/no-op planning without GitHub mutations.
- Repository-local reference validation and self-reference rejection.
- Missing-reference, duplicate-node and ambiguous-parent diagnostics.
- Reciprocal validation for parent/child and depends-on/blocks declarations.
- Dependency-cycle and parent-cycle detection across the available graph.
- Stable ordering for normalized lists, diagnostics and operations.
- Automated tests covering normalization, no-op, creation, removal, missing references, ambiguity, conflicts and cycles.

## Deliberately deferred

- Applying native GitHub relationship mutations belongs to the next child issue under #12.
- Remote graph discovery and pagination will be integrated with the GitHub adapter when mutation support is added.
- GitHub Action runtime wiring remains in #6.
