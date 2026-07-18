# UC Rust proving ground

`nomed/uc-rust` is the first proving ground for Yukh's GitHub projection and project-intelligence model.

## Operating mode

Until the migration gate is accepted:

- UC Rust governance manifests and embedded scripts remain authoritative for apply operations.
- Yukh consumes the same model in shadow mode and produces a drift/comparison report.
- Yukh must not mutate UC Rust GitHub metadata during shadow mode.
- Any semantic mismatch is resolved explicitly in both repositories.

## Minimum compatibility surface

The first compatibility slice covers:

- labels and milestones;
- issue membership in GitHub Project #4;
- native Project fields: Status, Priority, Type, Area, Release and Size;
- parent/sub-issue relationships;
- issue dependencies;
- deterministic drift reporting.

## Migration gate

Yukh may become the apply engine for UC Rust only when:

1. the same input model produces equivalent intended state;
2. shadow comparison reports zero unexplained drift;
3. reconciliation is idempotent;
4. failures are explicit and do not partially corrupt the projected state;
5. UC Rust accepts the migration through its governance issue and decision process.
