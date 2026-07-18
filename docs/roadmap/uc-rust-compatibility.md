# UC Rust governance compatibility roadmap

## Goal

Make Yukh capable of projecting the authoritative UC Rust project model into GitHub with behavior equivalent to the current embedded governance scripts, before taking ownership of apply operations.

## Phases

### Phase 1 — Contract capture

- freeze the UC Rust compatibility surface;
- import representative manifest fixtures;
- define expected projection and drift-report semantics;
- document unsupported or intentionally deferred behavior.

### Phase 2 — Read-only projection

- parse and validate UC Rust governance inputs;
- read repository and Project v2 state;
- compute deterministic desired-versus-actual drift;
- produce human-readable and machine-readable reports.

### Phase 3 — Sandbox reconciliation

- reconcile labels, milestones, Project items and fields in a sandbox repository;
- reconcile native parent/sub-issues and dependencies;
- prove idempotency and explicit failure behavior.

### Phase 4 — UC Rust shadow mode

- execute Yukh read-only comparison against UC Rust;
- compare with the legacy implementation;
- classify every difference as defect, semantic mismatch or intentional divergence.

### Phase 5 — Migration gate

- achieve zero unexplained drift;
- obtain acceptance in both repositories;
- switch UC Rust apply operations to a pinned Yukh release;
- retire embedded legacy scripts only after rollback evidence exists.

## Deferred from the minimum slice

- automatic creation of GitHub Project views;
- iteration planning;
- estimate forecasting;
- destructive cleanup;
- multi-provider project-management adapters.
