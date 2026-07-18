# ADR-0001 — Yukh is the authoritative project model

- Status: Accepted
- Date: 2026-07-18
- Decision owners: nomed

## Context

Project knowledge is currently fragmented across repositories, sessions, ADRs, issue trackers, project boards, bodies of knowledge and AI conversation context. Treating one external tool as authoritative creates lock-in and leaves important knowledge outside the model.

## Decision

Yukh will maintain the authoritative, versioned project model.

External systems such as GitHub Projects, GitHub Issues, Markdown trees, UC-BoK and Economics by Design repositories are sources, references or projections according to an explicit adapter contract. They are not implicitly authoritative.

The core model must therefore:

- remain independent from projection providers;
- represent stable identity and typed relations;
- preserve provenance and temporal history;
- distinguish desired projection state from observed projection state;
- tolerate projection outage and drift;
- support idempotent reconciliation;
- distinguish assertion, implementation, enforcement and evidence.

## Consequences

### Positive

- GitHub can be replaced or supplemented without rewriting project semantics.
- Agent context can be reconstructed from a coherent model.
- Historical state and decision rationale remain queryable.
- Governance can be validated before external mutation.

### Costs

- Yukh must define identity and conflict rules explicitly.
- Bidirectional synchronization requires authority boundaries.
- The first implementation is more deliberate than a GitHub-only script.

### Risks

- An over-general metamodel could become abstract and unusable.
- Duplicate authority between Yukh and existing repositories could cause divergence during migration.

## Guardrails

- Deliver vertical slices proven against UC Rust.
- Do not migrate authority from UC Rust until an explicit migration gate passes.
- Prefer a small stable core and typed extensions over one universal entity blob.
