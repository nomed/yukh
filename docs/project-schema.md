# Canonical GitHub Project schema

Yukh separates the Project schema into four ownership classes so that automation can remain deterministic without taking ownership of unrelated repository data.

## Ownership classes

| Class | Meaning | Bootstrap behavior | Issue reconciliation |
| --- | --- | --- | --- |
| `core` | Stable fields and vocabularies owned by Yukh | Create or extend when supported | May write governed values |
| `extension` | Repository-specific fields declared explicitly in policy | Create or extend when supported | May write declared values |
| `external` | Unrelated fields already present in the Project | Ignore and preserve | Never write |
| `derived` | GitHub-managed fields discovered from the Project | Discover and validate only | Use only through supported GitHub semantics |

Yukh never renames or deletes external fields or options. It never executes arbitrary repository scripts implicitly.

## Canonical core

Enable the core schema explicitly:

```yaml
bootstrap:
  core:
    enabled: true
```

The effective core is:

| Contract field | Project field | Type | Canonical values |
| --- | --- | --- | --- |
| `kind` | `Work Type` | single select | Gate, Epic, Feature, Task, Bug, Technical Debt |
| `priority` | `Work Priority` | single select | P0, P1, P2, P3 |
| `size` | `Size` | single select | XS, S, M, L, XL |
| `estimate` | `Estimate` | number | numeric |
| workflow state | `Status` | built-in single select | Backlog, Ready, In Progress, Review, Blocked, Done |
| `iteration` | `Iteration` | GitHub-managed | discovered and validated, not created by bootstrap |

`Work Priority` intentionally avoids collision with GitHub-derived fields named `Priority`.

The built-in `Status` field is governed through its options, but Yukh will not create it if absent. `Iteration` is classified as derived and is never created or renamed by schema bootstrap.

## Repository extensions

Repositories declare local fields under `bootstrap.extensions.fields`. `Area` is the primary example because each repository owns a different vocabulary:

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
          architecture: Architecture
          runtime: Runtime
```

Extensions must use contract fields supported by Yukh. Canonical core fields cannot be redeclared as extensions. Unsupported initialization remains an explicit repository workflow step after standard bootstrap.

## Deterministic effective schema

The policy loader builds one effective schema from:

1. canonical core defaults when `bootstrap.core.enabled` is true;
2. backward-compatible declarations under `fields`;
3. explicit repository extensions under `bootstrap.extensions.fields`;
4. canonical workflow names or repository workflow overrides.

Bootstrap plans mutations only for effective `core` and `extension` fields. Existing fields not present in the effective schema are classified as `external` and preserved. GitHub-managed fields are classified as `derived` unless they have a supported dedicated behavior such as built-in `Status`.

## Migration from legacy policies

Legacy policies without `bootstrap.core.enabled` keep their current mappings. This avoids changing existing Projects during upgrade.

To adopt the canonical model:

1. add `bootstrap.core.enabled: true`;
2. migrate custom `Priority` mappings to `Work Priority`;
3. remove duplicate declarations for canonical fields where defaults are sufficient;
4. move repository-specific `Area` configuration to `bootstrap.extensions.fields.area`;
5. run `bootstrap-project` in dry-run mode;
6. review the complete plan before apply;
7. run apply twice and verify the second run reports zero operations.

Yukh merges missing options non-destructively and preserves additional options already present in owned fields. It preserves all unrelated fields.

## Consumer notes

- RGK already uses `Work Priority` and canonical `Status` options after the live bootstrap validation.
- The UC Rust fixture under `examples/uc-rust/` demonstrates the canonical core plus an `Area` extension.
- Existing consumer Projects are not renamed automatically. Migration is explicit and fail-closed.
