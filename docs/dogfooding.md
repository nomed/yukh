# Yukh dogfooding

Yukh is the first repository to run its own released action. UC Rust remains the first external adopter.

## Repository settings

1. Set repository variable `YUKH_PROJECT_NUMBER` to the Project v2 number used by Yukh.
2. Keep default workflow permissions read-only.
3. Allow the Yukh tag policy you intend to support in production: `nomed/yukh@latest`, `@v0`, `@v0.1`, `@v0.1.0`, or a commit SHA, plus the official GitHub actions used by the reusable workflow.
4. Configure required CI checks on protected branches.
5. Keep issue reconciliation serialized by repository and issue number.

## Authentication

Dry-run uses read-only repository permissions. Apply uses the separate `YUKH_PROJECT_TOKEN` secret. Prefer a GitHub App installation token with access to this repository and the selected Project; use a fine-grained PAT only as a temporary fallback.

## Evidence procedure

1. Confirm that the full release tag `v0.1.0` resolves to the released action revision.
2. Open or edit an issue containing a valid Yukh contract and capture the dry-run workflow URL.
3. Run **Yukh self apply** for the issue with `confirm_apply=true` and capture the workflow URL and resulting Project fields.
4. Run the same apply again and verify `Applied operations: 0` and `No drift detected`.
5. Record token type, Project number, repository Actions settings, and any upstream gaps in issue #30 without recording secret values.

## Rollback and removal

Rollback by pinning the previous immutable release. To remove Yukh, disable both self workflows, delete the workflow files and `.yukh/project.yaml`, revoke the App installation or secret, and retain issue and Project data as-is.

## UC Rust handoff

After dogfooding is accepted, update `examples/uc-rust/` with any lessons learned and start `nomed/uc-rust#69` using the verified immutable release.
