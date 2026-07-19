# Current development context

## Current state

- Yukh is released and consumes its own GitHub Action.
- Self-dogfooding completed on `nomed/yukh#30` using Project `#5`.
- A real apply succeeded and the identical second apply produced zero operations, no remaining drift, and no diagnostics.
- The self workflows keep the default `GITHUB_TOKEN` read-only and use `YUKH_PROJECT_TOKEN` only for controlled apply.
- UC Rust adoption material is isolated under `examples/uc-rust/`.

## Implemented

- hidden YAML issue-contract parsing and validation;
- repository policy loading and desired-state construction;
- GitHub Project v2 discovery and deterministic reconciliation planning;
- controlled, retryable, idempotent Project-field application;
- parent/sub-issue and dependency reconciliation;
- composite GitHub Action runtime with dry-run and apply modes;
- release-please semantic releases and Action version aliases;
- CI type checking, tests, and package verification;
- installation, permission, rollback, removal, and dogfooding documentation.

## Current documentation audit

- replace stale README foundation-only status;
- remove broken references such as the absent `docs/vision.md`;
- record completed dogfooding evidence;
- align release and adoption guidance with the implemented workflows.

## Next

- complete and merge the post-dogfooding documentation alignment;
- start external adoption under `nomed/uc-rust#69`;
- run UC Rust in dry-run first and accept its migration gate before enabling apply;
- treat repository labels, milestones, and other unsupported legacy synchronization behavior as explicit future capabilities rather than implied current support.