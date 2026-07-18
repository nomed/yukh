# Session — UC Rust shadow migration

Date: 2026-07-18

## Decision

Yukh will become the generic project-intelligence and GitHub-projection engine. UC Rust remains the authoritative proving ground until an explicit migration gate is accepted.

## Boundaries

- Yukh owns generic project-model and projection behavior.
- UC Rust owns its project-specific model, domain work, UC-BoK traceability and EbD evidence.
- Embedded UC Rust governance scripts are frozen as a legacy baseline, not extended with new generic behavior.
- Yukh begins read-only shadow comparison before any apply responsibility.

## Next actions

- create a UC Rust compatibility epic and atomic deliverables;
- update UC Rust issue #20 to represent the migration gate;
- capture fixtures from the UC Rust governance manifests;
- implement deterministic drift reporting;
- prove reconciliation in a sandbox before UC Rust apply mode.
