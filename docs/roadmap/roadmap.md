# Yukh Roadmap

## M0 — Meta Model

Outcome: a stable, validated language for project identity, entities, relations, provenance, events and temporal state.

Deliverables:

- project charter and manifesto;
- ADR-0001;
- identity and lifecycle model;
- entity and relation schemas;
- Knowledge Event schema;
- temporal and supersession semantics;
- first UC Rust fixture;
- repository validation workflow.

Exit gate: the UC Rust example can be represented without using GitHub-specific semantics in the core model.

## M1 — Knowledge Engine

Outcome: accepted events produce deterministic current state and historical snapshots.

Deliverables:

- event append and validation contract;
- deterministic reducer;
- snapshot format;
- session ingestion;
- decision and evidence lifecycle;
- time-travel query contract;
- bounded agent context package.

Exit gate: reconstruct a UC Rust project snapshot at two revisions and explain the delta with provenance.

## M2 — GitHub Projection

Outcome: GitHub becomes a convergent projection of Yukh.

Deliverables:

- issue, milestone and Project v2 mapping;
- parent/sub-issue and dependency projection;
- roadmap and field reconciliation;
- desired/observed/drift model;
- dry-run and apply plans;
- idempotency and partial-failure evidence;
- import path from the current UC Rust governance manifests.

Exit gate: project UC Rust into GitHub from Yukh, detect deliberate drift and reconcile without losing model history.

## M3 — Knowledge Adapters

Outcome: project knowledge links to external authoritative bodies without copying their authority.

Deliverables:

- UC-BoK traceability adapter;
- Economics by Design adapter;
- revision pinning and compatibility policy;
- reciprocal feedback references;
- evidence and epistemic-status mapping.

Exit gate: a UC Rust capability traces to UC-BoK, EbD, implementation issue and evidence through one queryable graph.

## M4 — Agent Runtime

Outcome: agents receive fresh, minimal and governed external memory.

Deliverables:

- role-aware context assembly;
- freshness and relevance policy;
- semantic retrieval as a derived index;
- write-back proposals and approval flow;
- session consolidation;
- privacy and authorization controls;
- MCP or equivalent protocol adapter.

Exit gate: a new agent can resume UC Rust work with bounded context, cite sources, identify uncertainty and propose changes without reconstructing the project from chat history.
