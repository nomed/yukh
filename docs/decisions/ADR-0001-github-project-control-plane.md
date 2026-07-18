# ADR-0001 — GitHub Project is the operational control plane

- Status: Accepted
- Date: 2026-07-18

## Context

Agents can create and edit GitHub issues through many clients, but those clients often cannot manage GitHub Project v2 fields, iterations, roadmap values or native issue relationships.

The previous Yukh direction introduced a separate authoritative project model. That added abstraction without solving the immediate orchestration problem.

## Decision

GitHub Issues and GitHub Projects remain the operational system of record for delivery work.

Yukh defines a repository-owned issue contract and runs as a reconciliation Action. Agents declare planning metadata inside a hidden YAML block in the issue body. Yukh validates that declaration and performs the richer Project operations that the agent client cannot perform.

## Consequences

- Agents remain independent from the Yukh implementation.
- GitHub Project views become useful without requiring manual field maintenance.
- Yukh does not need a separate knowledge graph or event store.
- Repository policy must define authority and overwrite behavior per field.
- Project API permissions and token setup become explicit deployment concerns.
- Reconciliation must be idempotent and safe under repeated issue events.
