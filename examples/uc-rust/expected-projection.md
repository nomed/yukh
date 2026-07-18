# Expected UC Rust projection

The adoption fixture must project at least the following managed state:

- membership of the governed issue in the configured GitHub Project;
- Project fields `Status`, `Priority`, `Work Type`, `Area`, `Size`, `Estimate`, and `Iteration` when configured;
- deterministic diagnostics for missing, ambiguous, or unsupported mappings;
- preservation of unmanaged and human-owned values;
- an idempotent plan where a repeated apply against matching state performs zero writes.

The pilot evidence must identify each planned or applied difference with enough context to understand the field, desired value, observed value, and remediation outcome.

Repository labels, milestones, and UC Rust legacy synchronization scripts are outside this first packaged adoption fixture unless added through a later explicit Yukh capability.
