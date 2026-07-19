# Yukh dogfooding

Yukh is the first repository to run its own released action. UC Rust is the first planned external adopter.

## Repository settings

1. Set `YUKH_PROJECT_NUMBER` to the selected Project v2 number.
2. Keep the default workflow token read-only.
3. Use `YUKH_PROJECT_TOKEN` only for controlled apply.
4. Serialize reconciliation by repository and issue number.

## Verified result

Self-dogfooding completed on `nomed/yukh#30` using Project `#5`.

- the released action resolved successfully;
- the first real apply completed successfully;
- the identical second apply reported `Applied 0 operation(s)`;
- the result contained no remaining drift and no diagnostics.

Issue `#30` is closed as completed.

## Procedure for future releases

1. Pin the candidate full semantic-version tag or commit SHA.
2. Run dry-run on a representative governed issue.
3. Review the plan and diagnostics.
4. Run controlled apply with explicit confirmation.
5. Repeat the identical apply and require zero operations, no remaining drift, and no diagnostics.
6. Record workflow URLs without recording secret values.

## Authentication

Dry-run uses read-only repository permissions. Apply uses the separate Project-capable token. Prefer a GitHub App installation token; use a narrowly scoped fine-grained PAT only as a fallback.

## Rollback and removal

Rollback by restoring the previous known-good immutable release. To remove Yukh, disable the workflows, delete the workflow files and `.yukh/project.yaml`, revoke the App installation or secret, and retain issue and Project data as-is.

## UC Rust handoff

The adoption material is maintained under `examples/uc-rust/`. UC Rust proceeds under `nomed/uc-rust#69`, beginning with dry-run and moving to apply only after its migration gate is accepted.