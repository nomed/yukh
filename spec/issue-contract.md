# Issue contract v1

A Yukh-managed issue contains one hidden YAML block in its body:

```markdown
<!-- yukh
schema: 1
kind: gate
area: governance
priority: P0
milestone: M0
parent: 55
depends_on: [56, 57]
blocks: [46]
size: S
estimate: 2
iteration: auto
execution: human
extensions:
  component: edge
-->
```

## Parsing rules

- The opening marker must be exactly `<!-- yukh`.
- The closing marker must be exactly `-->`.
- Only one Yukh block is allowed.
- YAML keys are case-sensitive.
- Unknown top-level keys are rejected unless prefixed with `x-`.
- Repository-governed dimensions use the `extensions:` mapping and must be declared by the effective repository policy.
- Issue references are repository-local numbers in v1.
- The block is declarative input; Project values are reconciled from it.

## Required keys

| Key | Meaning |
|---|---|
| `schema` | Contract version. Must be `1`. |
| `kind` | Work classification defined by repository policy. |
| `area` | Owning product or architecture area. |
| `priority` | Planning priority defined by repository policy. |

## Optional keys

| Key | Meaning |
|---|---|
| `milestone` | Stable milestone code mapped to a GitHub milestone. |
| `parent` | Parent issue number. |
| `children` | Expected child issue numbers. |
| `depends_on` | Issues that must complete before this issue can become ready. |
| `blocks` | Issues whose readiness depends on this issue. |
| `size` | Relative size. |
| `estimate` | Numeric estimate used by the Project. |
| `iteration` | Iteration code or `auto`. |
| `execution` | `agent`, `human` or `hybrid`. |
| `owner` | Accountable GitHub login when explicitly known. |
| `extensions` | Mapping of repository-specific governed dimensions declared in `.yukh/project.yaml`. |

## Policy-declared extensions

Repositories may add governed Project dimensions without changing Yukh source. The policy declares the logical name, Project field, ownership, requiredness and allowed values:

```yaml
fields:
  component:
    project_field: Component
    ownership: extension
    required: true
    values:
      edge: Edge
      hub: Hub
      shared: Shared
```

The issue contract supplies the normalized value under a stable namespace:

```yaml
extensions:
  component: edge
```

Extension names must be normalized identifiers and must not collide with core, relationship or opaque `x-*` keys. Undeclared extensions, missing required extensions and values outside the policy allowlist fail closed. Bootstrap and issue reconciliation project declared extensions like other Yukh-managed fields; a repository that declares no extensions retains existing schema-v1 behavior.

## Authority

Repository policy defines which source is authoritative for each Project field. A typical rule accepts a label as agent-compatible input but makes the Project field the normalized representation.

## Validation

Yukh must reject or report:

- malformed YAML;
- unsupported schema versions;
- values absent from policy;
- self-references;
- conflicting parent declarations;
- dependency cycles detectable in the available graph;
- references to missing issues;
- an explicit iteration that does not exist.

Yukh must not invent a missing priority, estimate, owner or iteration unless the repository policy defines a deterministic rule.
