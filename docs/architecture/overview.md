# Architecture Overview

## Context

Yukh is a model-driven Project Intelligence Engine. It stores the authoritative project model independently from the tools used to display or operate it.

```text
Sources and commands
        |
        v
Ingestion and validation
        |
        v
Authoritative temporal graph
        |
        +--> snapshots and context assembly
        +--> policy and governance evaluation
        +--> projection planning
                    |
                    +--> GitHub
                    +--> Markdown / filesystem
                    +--> UC-BoK traceability
                    +--> EbD traceability
                    +--> future adapters
```

## Architectural layers

### Core model

Defines stable identity, entities, relations, knowledge events, provenance, lifecycle state and temporal validity. It has no dependency on GitHub, Jira, cloud vendors or LLM providers.

### Knowledge engine

Applies events to the model, validates invariants, reconstructs state at a revision or time, produces snapshots and assembles bounded context packages.

### Governance engine

Evaluates policies, required evidence, ownership, state transitions, approval requirements and drift.

### Projection engine

Computes a desired external representation, compares it with the observed external state and produces a reconciliation plan. Projection state is never authoritative.

### Adapters

Translate between the core model and concrete systems. Initial adapters are planned for GitHub, Markdown/filesystem, UC-BoK and Economics by Design.

## Write model

Yukh follows an event-informed model:

1. a command proposes a change;
2. validation checks identity, authority and invariants;
3. one or more Knowledge Events are appended;
4. the current graph is derived from accepted events;
5. projections reconcile asynchronously;
6. evidence records whether the intended external effect occurred.

This does not commit the implementation to a particular event-store technology. The semantic distinction between event history and current state is mandatory; the storage engine is replaceable.

## Temporal model

Each entity and relation can expose:

- identity lifetime;
- valid time: when the fact is true in the project domain;
- recorded time: when Yukh learned or accepted the fact;
- supersession and invalidation links;
- source revision and provenance.

This enables queries such as:

- What was the approved architecture on a given date?
- Which evidence justified a release decision?
- What changed after a session?
- Which GitHub projection was expected from a model revision?

## Consistency boundaries

The authoritative model must remain internally consistent before any projection is attempted. External projections may be temporarily stale or unavailable and must converge through idempotent reconciliation.

A projection failure records evidence and drift; it does not roll back accepted project knowledge.

## Security and authority

Every command and event must be attributable to an actor. Later phases will introduce typed permissions for proposing, accepting, superseding and projecting knowledge. Deny-by-default is the target posture for consequential operations.

## Initial non-goals

- replacing Git itself;
- replacing domain-specific bodies of knowledge;
- building a general-purpose enterprise knowledge graph;
- autonomous acceptance of architecture or risk decisions;
- semantic search before identity, provenance and temporal correctness are stable.
