# Current development context

## Active issue

- `#29 Implement versioned packaging and automated releases`
- Branch: `feat/issue-29-versioned-packaging`

## Implemented

- release-please configuration and manifest for semantic GitHub Releases.
- Conventional Commit release flow and generated changelog foundation.
- Package verification for all runtime files required by the composite action.
- CI integration for type checking, tests, and package verification.
- Immutable release-tag installation guidance.
- Public/private repository Action settings and permission profiles.
- Upgrade, rollback, compatibility, deprecation, removal, and troubleshooting guidance.
- Minimal consumer policy and issue-contract examples.

## Next

- Merge the implementation PR.
- Merge the generated release-please PR to create the first verified release.
- Complete #30 by dogfooding the pinned release on Yukh itself.
- Use UC Rust as the first external adopter under `nomed/uc-rust#69`.
