# Architecture

Yukh follows a controller pattern.

```text
Issue created or edited
        |
        v
Parse hidden YAML metadata
        |
        v
Validate repository policy
        |
        v
Read current GitHub Project state
        |
        v
Build a reconciliation plan
        |
        v
Apply safe, idempotent mutations
        |
        v
Report success, drift or validation errors
```

## Inputs

- issue title, body, labels, milestone and state;
- hidden `<!-- yukh ... -->` YAML metadata;
- repository configuration under `.yukh/`;
- current GitHub Project fields and item values;
- native issue relationships and dependencies.

## Outputs

- Project membership;
- custom field values;
- iteration and roadmap placement;
- parent and child relationships;
- dependency relationships;
- workflow and readiness status;
- a check result or diagnostic comment.

## Safety rules

1. Reconciliation is idempotent.
2. Missing required metadata produces a diagnostic, not guessed data.
3. Unknown field values fail before writes.
4. Existing human data is not overwritten unless policy declares Yukh authoritative for that field.
5. Repeated events converge on the same Project state.
6. Partial failure is reported and can be retried safely.

## Initial modules

- contract parser;
- policy loader;
- validator;
- GitHub repository adapter;
- GitHub Project v2 adapter;
- relationship reconciler;
- workflow evaluator;
- Action entry point.
