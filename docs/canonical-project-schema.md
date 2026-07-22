# Canonical GitHub Project schema

Yukh treats the GitHub Project as a governed control plane. Governance is intentionally scoped: Yukh owns a stable canonical core, repositories own declared extensions, and unrelated fields remain untouched.

## Canonical core

The canonical logical fields are:

| Logical field | Default Project field | Ownership |
|---|---|---|
| `kind` | `Work Type` | core |
| `priority` | `Work Priority` | core |
| `size` | `Size` | core |
| `estimate` | `Estimate` | core |
| `status` | `Status` | core workflow surface |
| `iteration` | `Iteration` | derived/discovered |

Canonical names must not collide with GitHub-derived fields. In particular, policies should map `priority` to `Work Priority`, not `Priority`.

The standard vocabularies are:

- Work Type: Gate, Epic, Feature, Task, Bug, Technical Debt;
- Work Priority: P0, P1, P2, P3;
- Size: XS, S, M, L, XL;
- Status: Backlog, Ready, In Progress, Review, Blocked, Done.

The repository policy remains the effective source used by reconciliation. Existing version 1 policies are backward compatible.

## Ownership classes

Every effective field belongs to one class:

- `core`: canonical and governed by Yukh;
- `extension`: repository-specific but declared in policy and supported by Yukh;
- `external`: present in the Project but absent from the effective Yukh policy;
- `derived`: managed by GitHub or otherwise not safe for schema mutation.

Only `core` and supported `extension` fields are writable by normal Yukh reconciliation. External fields are ignored and preserved. Derived fields may be discovered and validated but are not treated as ordinary custom fields.

## Repository extensions

`Area` is the default extension. Its vocabulary belongs to the repository because bounded contexts differ between codebases.

```yaml
fields:
  area:
    project_field: Area
    required: true
    values:
      governance: Governance
      architecture: Architecture
      runtime: Runtime
```

A policy-declared extension is managed only within the declared field and values. Yukh does not rename or delete unrelated Project fields or options.

Date extensions use `type: date`, do not declare `values`, and carry a real ISO calendar date (`YYYY-MM-DD`) in the issue contract. Yukh bootstraps them as GitHub `DATE` fields and reconciles them without converting them to single-select options.

## Local custom initialization

Unsupported Project field types or repository-specific automation remain explicit local workflow steps. Yukh never executes arbitrary repository scripts implicitly.

Recommended order:

1. run Yukh `bootstrap-project`;
2. run an optional repository-local initializer for unsupported custom fields;
3. run issue reconciliation;
4. repeat bootstrap to verify zero operations.

## Migration

Existing consumers should:

1. map logical priority to `Work Priority`;
2. keep repository-specific `Area` values in the local policy;
3. preserve unrelated existing fields;
4. use the canonical Status workflow unless an explicit repository policy requires different names;
5. verify bootstrap idempotency before enabling automated apply.
