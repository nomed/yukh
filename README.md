# Yukh

**Policy-driven GitHub Project reconciliation for agentic repositories.**

Yukh lets AI agents create ordinary GitHub issues through the tools they already have, while a GitHub Action interprets a machine-readable contract embedded in each issue and organizes the repository's GitHub Project correctly.

GitHub Project is the operational control plane. Yukh is the policy and reconciliation layer.

```text
Agent using GitHub tools
        |
        | creates or edits an issue
        v
GitHub issue with hidden Yukh metadata
        |
        | issue event
        v
Yukh GitHub Action
        |
        +-- validates conventions
        +-- adds the issue to the configured Project
        +-- sets Project custom fields
        +-- creates parent/child relationships
        +-- reconciles dependencies
        +-- derives workflow status and readiness
        +-- assigns iteration and roadmap data
        v
Organized GitHub Project
```

## The issue contract

Agents write normal Markdown for people and include a hidden YAML block for automation:

```markdown
<!-- yukh
schema: 1
kind: gate
area: governance
priority: P0
milestone: M0
parent: 55
depends_on: [56, 57, 58, 59, 60]
blocks: [46, 47, 54]
size: S
estimate: 2
iteration: auto
execution: human
-->

## Objective

Approve the knowledge foundation before dependent work becomes ready.
```

The contract is intentionally compatible with constrained agent clients: an agent only needs permission to create or edit an issue. Yukh performs the Project operations those clients do not expose.

## What Yukh owns

- issue-contract specifications and templates;
- repository conventions for titles, labels and relationships;
- mapping from issue metadata and labels to GitHub Project fields;
- workflow, dependency and readiness policies;
- idempotent GitHub Action reconciliation;
- diagnostics when an issue cannot be reconciled safely.

## What Yukh does not own

- authoring the issue on behalf of the agent;
- replacing GitHub Issues or GitHub Projects;
- maintaining a separate authoritative knowledge graph;
- acting as a project-management application;
- silently inventing missing planning information.

## Repository direction

The first proving ground is `nomed/uc-rust`. The initial vertical slice is:

1. define the hidden issue metadata contract;
2. define the UC Rust Project field mapping;
3. validate an issue on `opened` and `edited` events;
4. add it to the correct GitHub Project;
5. populate Priority, Size, Estimate and Iteration;
6. reconcile parent, child and dependency relationships;
7. report missing or ambiguous metadata without destructive changes.

See:

- [`docs/vision.md`](docs/vision.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`spec/issue-contract.md`](spec/issue-contract.md)
- [`examples/uc-rust/issue-61.md`](examples/uc-rust/issue-61.md)

## Status

The repository has been reset to the product definition and contract-first foundation. No production-ready reconciler is claimed yet.
