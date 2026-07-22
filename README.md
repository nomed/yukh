# Yukh

**Policy-driven GitHub Project reconciliation for agentic repositories.**

Yukh lets people and AI agents create ordinary GitHub issues while a GitHub Action interprets a hidden, machine-readable contract and reconciles Project fields, managed labels, milestones, parent/sub-issue hierarchy, and issue dependencies.

GitHub Issues remain the human and agent collaboration surface. GitHub Projects remain the operational control plane. Yukh provides the policy, validation, planning, and idempotent reconciliation layer between them.

```text
Issue created or edited
        |
        v
Hidden Yukh contract parsed and validated
        |
        v
Current Project and relationship state discovered
        |
        v
Deterministic reconciliation plan produced
        |
        +-- dry-run: report only
        |
        `-- apply: perform explicitly authorized mutations
        v
Converged GitHub Project state
```

## Capabilities

Yukh currently supports:

- validating hidden YAML issue contracts against a repository policy;
- adding governed issues to a configured GitHub Project v2;
- reconciling supported Project fields;
- planning and applying parent/sub-issue and dependency relationships;
- dry-run diagnostics before mutation;
- controlled apply mode with a dedicated Project-capable token;
- idempotent retries, including a verified second apply with zero operations;
- versioned GitHub Action releases generated through release-please.

## Issue contract

Agents and people write normal Markdown and add a hidden contract:

```markdown
<!-- yukh
schema: 1
kind: feature
area: runtime
priority: P1
size: M
estimate: 5
parent: 12
depends_on: [18, 21]
-->

## Objective

Implement the next reconciliation capability.
```

The repository policy under `.yukh/project.yaml` defines the accepted values and their mapping to Project fields and optional managed labels. Yukh does not invent missing planning information and does not overwrite unmanaged human-owned fields or labels unless the policy explicitly declares them.

See [`spec/issue-contract.md`](spec/issue-contract.md) for the contract specification.

## Installation

1. Copy [`examples/minimal/project.yaml`](examples/minimal/project.yaml) to `.yukh/project.yaml` in the consumer repository and adapt the mappings.
2. Add a workflow that checks out the consumer repository and invokes a pinned Yukh release.
3. Start in `dry-run` with read-only repository permissions.
4. Add a dedicated `YUKH_PROJECT_TOKEN` secret only for controlled apply workflows when the selected Project requires broader access than `GITHUB_TOKEN` provides.

Example action step:

```yaml
- uses: actions/checkout@v4
- uses: nomed/yukh@v0.2.1
  with:
    issue-number: ${{ github.event.issue.number }}
    project-number: ${{ vars.YUKH_PROJECT_NUMBER }}
    policy-path: .yukh/project.yaml
    mode: dry-run
```

Use a full semantic-version tag or commit SHA when an immutable pin is required. See [`docs/packaging-and-releases.md`](docs/packaging-and-releases.md) for release aliases, permissions, upgrade, rollback, and removal guidance.

## Apply safety

Apply mode requires all of the following:

- `mode: apply`;
- `apply-enabled: true`;
- a token with access to the target repository and Project;
- a valid issue contract and policy mapping.

Dry-run and apply build the same deterministic plan. Apply executes only supported operations and reports remaining drift and diagnostics explicitly.

## Verified dogfooding

Yukh is the first repository to consume its own released action. The self-hosted workflow was verified against issue `nomed/yukh#30` with:

- a successful real apply;
- a second identical apply reporting `Applied 0 operation(s)`;
- `remaining: []` and no diagnostics.

UC Rust is the first planned external adopter. Its adoption fixture is maintained under [`examples/uc-rust/`](examples/uc-rust/).

## Repository guide

- [`docs/architecture.md`](docs/architecture.md) — controller flow and safety rules;
- [`docs/packaging-and-releases.md`](docs/packaging-and-releases.md) — installation and release model;
- [`docs/dogfooding.md`](docs/dogfooding.md) — self-hosting evidence, authentication, rollback, and handoff;
- [`spec/issue-contract.md`](spec/issue-contract.md) — issue contract format;
- [`examples/minimal/project.yaml`](examples/minimal/project.yaml) — minimal consumer policy;
- [`examples/uc-rust/`](examples/uc-rust/) — first external-adoption fixture.

## Status

The parser, policy loader, Project discovery, deterministic planning, controlled apply path, relationship reconciliation, packaging, and release automation are implemented and covered by CI. Self-dogfooding and apply idempotency have been proven on the live Yukh repository.

The next adoption milestone is `nomed/uc-rust#69`.
