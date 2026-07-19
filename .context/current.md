# Current development context

## Current state

- Yukh is released and consumes its own GitHub Action.
- Self-dogfooding completed on `nomed/yukh#30` using Project `#5`.
- A real apply succeeded and the identical second apply produced zero operations, no remaining drift, and no diagnostics.
- RGK validated fail-closed Project discovery, canonical Status bootstrap, external Project adoption, and idempotent reconciliation.
- The self workflows keep the default `GITHUB_TOKEN` read-only and use `YUKH_PROJECT_TOKEN` only for controlled apply.
- UC Rust adoption material is isolated under `examples/uc-rust/`.

## Implemented

- hidden YAML issue-contract parsing and validation;
- repository policy loading and desired-state construction;
- GitHub Project v2 discovery and deterministic reconciliation planning;
- controlled, retryable, idempotent Project-field application;
- Project schema bootstrap with safe preflight and canonical Status options;
- parent/sub-issue and dependency reconciliation;
- composite GitHub Action runtime with dry-run and apply modes;
- release-please semantic releases and Action version aliases;
- CI type checking, tests, and package verification;
- installation, permission, rollback, removal, and dogfooding documentation.

## Current work — issue #56

- define an opt-in canonical Project core: Work Type, Work Priority, Size, Estimate, Status, and Iteration;
- classify effective and discovered fields as core, extension, external, or derived;
- support repository-specific fields such as Area through explicit policy extensions;
- restrict bootstrap and issue reconciliation to the effective owned schema;
- preserve unrelated Project fields and options;
- maintain legacy policy behavior until canonical core bootstrap is explicitly enabled;
- publish migration guidance for Yukh, RGK, UC Rust, and future consumers.

## Next

- complete CI and review for the canonical schema implementation;
- publish the corresponding minor release;
- migrate consumer policies deliberately rather than renaming Project fields automatically;
- continue the UC Rust adoption gate using the released canonical policy model.
