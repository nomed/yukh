# Yukh

**Model-driven Project Intelligence.**

Yukh maintains the authoritative, versioned knowledge model of a software project and projects that model into external systems such as GitHub, Markdown repositories, roadmaps, architecture records, Economics by Design models and AI-agent context.

> GitHub is a projection of the project model, not the project model itself.

## Why Yukh

Complex software projects distribute their memory across chats, issues, ADRs, documents, roadmaps, test evidence and external bodies of knowledge. The result is duplication, stale context and governance that depends on human recollection.

Yukh provides one governed model for:

- sessions and knowledge events;
- decisions and ADRs;
- requirements, capabilities and risks;
- evidence and quality attributes;
- backlog, milestones and roadmap;
- external traceability, including UC-BoK and Economics by Design;
- projections toward GitHub and other tools;
- context reconstruction for humans and AI agents;
- time-travel queries over project state.

## Current status

Yukh is in **M0 — Meta Model**. The repository currently defines the project mission, architecture, metamodel, schemas and the first UC Rust example. No production runtime or complete GitHub projection is claimed yet.

## Repository structure

```text
docs/
  architecture/
  decisions/
  roadmap/
model/
  schemas/
examples/
  uc-rust/
.context/
  sessions/
```

## Initial milestones

- **M0 — Meta Model**: identity, entities, relations, events, validation and time semantics.
- **M1 — Knowledge Engine**: sessions, decisions, evidence, traceability and snapshots.
- **M2 — GitHub Projection**: issues, milestones, projects, roadmap, parents, children and dependencies.
- **M3 — Knowledge Adapters**: UC-BoK and Economics by Design integration.
- **M4 — Agent Runtime**: context reconstruction, retrieval and governed external memory.

## First proving ground

`nomed/uc-rust` is the first dogfooding project. Existing UC Rust governance remains authoritative until Yukh reaches an explicit migration gate.

## Principles

1. The model is authoritative; external tools are projections.
2. Current state and historical state are both first-class.
3. Every claim has provenance and epistemic status.
4. Implemented and evidenced are distinct states.
5. Projection failures must never corrupt the authoritative model.
6. Human approval remains explicit for consequential decisions.
7. Economic consequences are part of project intelligence, not an afterthought.

## License

License selection is intentionally deferred to an explicit governance decision before the first public release.
