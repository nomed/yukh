# Yukh Roadmap

## M0 — Contract

Outcome: agents can create issues with a stable hidden metadata block.

Deliverables:

- issue contract v1;
- repository policy format;
- UC Rust field and label mapping;
- validation fixtures for valid and invalid issues.

Exit gate: issue #61 can be parsed and validated deterministically.

## M1 — Read-only inspection

Outcome: Yukh can compare one issue with its GitHub Project representation without writing.

Deliverables:

- GitHub issue reader;
- Project v2 field discovery;
- desired-state calculation;
- dry-run reconciliation report;
- diagnostics for missing fields and invalid references.

Exit gate: Yukh reports exactly which values are absent or inconsistent for UC Rust issue #61.

## M2 — Field reconciliation

Outcome: Yukh safely adds an issue to the Project and populates configured fields.

Deliverables:

- Project membership reconciliation;
- Priority, Work Type, Area, Size and Estimate mapping;
- milestone mapping;
- idempotency tests;
- check-run or comment diagnostics.

Exit gate: repeated execution converges without duplicate items or unwanted overwrites.

## M3 — Relationships and workflow

Outcome: parent, child and dependency structure controls readiness and status.

Deliverables:

- native sub-issue reconciliation;
- dependency reconciliation;
- cycle and missing-reference validation;
- derived Blocked, Backlog and Ready states;
- gate and human-approval policy.

Exit gate: issue #61 remains blocked until its declared dependencies are complete and then moves to the configured decision state.

## M4 — Iterations and roadmap

Outcome: the GitHub Project exposes a useful backlog, sprint plan and roadmap.

Deliverables:

- iteration discovery and assignment policy;
- explicit and automatic scheduling rules;
- roadmap start and target mapping;
- standard Project views documented as policy;
- bulk reconciliation for existing UC Rust issues.

Exit gate: UC Rust has populated backlog, current-iteration and roadmap views with no unexplained drift.

## M5 — Reusable Action

Outcome: other repositories can adopt Yukh through versioned configuration and one reusable Action.

Deliverables:

- packaged GitHub Action;
- installation guide;
- policy schema versioning;
- migration and rollback procedure;
- compatibility test suite.
