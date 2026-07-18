# ADR-0002 — UC Rust compatibility through shadow projection

- Status: Accepted
- Date: 2026-07-18

## Decision

Yukh will use `nomed/uc-rust` as its first proving ground through a staged migration:

1. capture the compatibility contract and fixtures;
2. implement read-only projection and deterministic drift reporting;
3. prove reconciliation in a sandbox repository;
4. run against UC Rust in shadow mode;
5. switch apply ownership only after an explicit bilateral migration gate.

UC Rust remains authoritative for governance writes until the gate is accepted. Yukh must not silently mutate or reinterpret UC Rust state during shadow mode.

## Rationale

This approach avoids duplicate long-term implementations while preserving a working governance baseline and making the migration reversible and evidence-driven.
