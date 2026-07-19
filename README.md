# Yukh

**Policy-driven GitHub Project reconciliation for agentic repositories.**

Yukh lets people and AI agents create ordinary GitHub issues while a GitHub Action interprets a hidden, machine-readable contract and reconciles the issue into a GitHub Project.

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
- bootstrapping a canonical GitHub Project schema plus repository extensions;
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

The repository policy under `.yukh/project.yaml` defines the accepted values and their mapping to Project fields. Yukh does not invent missing planning information and does not overwrite unmanaged human-owned values unless the policy explicitly allows it.

See [`spec/issue-contract.md`](spec/issue-contract.md) for the contract specification.

## Canonical Project schema

Repositories may enable Yukh's canonical core schema and add explicit local extensions:

```yaml
bootstrap:
  core:
    enabled: true
  extensions:
    fields:
      area:
        project_field: Area
        required: true
        values:
          governance: Governance
          runtime: Runtime
```

The canonical core uses `Work Type`, `Work Priority`, `Size`, `Estimate`, built-in `Status`, and GitHub-managed `Iteration`. Unrelated Project fields are classified as external, ignored, and preserved.

See [`docs/project-schema.md`](docs/project-schema.md) for ownership classes, canonical values, migration, and extension rules.

## Installation

1. Copy [`examples/minimal/project.yaml`](examples/minimal/project.yaml) to `.yukh/project.yaml` in the consumer repository and adapt the extension values.
2. Add a workflow that checks out the consumer repository and invokes a pinned Yukh release.
3. Start in `dry-run` with read-only repository permissions.
4. Add a dedicated `YUKH_PROJECT_TOKEN` secret only for controlled apply workflows when the selected Project requires broader access than `GITHUB_TOKEN` provides.

Example action step:

```yaml
- uses: actions/checkout@v4
- uses: nomed/yukh@v0.4.0
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

RGK has also validated Project bootstrap, canonical `Status`, fail-closed field classification, and idempotent issue reconciliation on a live external Project. UC Rust is maintained as the first `nomed` external-adoption fixture under [`examples/uc-rust/`](examples/uc-rust/).

## Repository guide

- [`docs/architecture.md`](docs/architecture.md) — controller flow and safety rules;
- [`docs/project-schema.md`](docs/project-schema.md) — canonical core, ownership, extensions, and migration;
- [`docs/packaging-and-releases.md`](docs/packaging-and-releases.md) — installation and release model;
- [`docs/dogfooding.md`](docs/dogfooding.md) — self-hosting evidence, authentication, rollback, and handoff;
- [`spec/issue-contract.md`](spec/issue-contract.md) — issue contract format;
- [`examples/minimal/project.yaml`](examples/minimal/project.yaml) — minimal canonical consumer policy;
- [`examples/uc-rust/`](examples/uc-rust/) — external-adoption fixture.

## Status

The parser, policy loader, Project discovery, canonical schema bootstrap, deterministic planning, controlled apply path, relationship reconciliation, packaging, and release automation are implemented and covered by CI. Self-dogfooding, live external bootstrap, and apply idempotency have been proven.
