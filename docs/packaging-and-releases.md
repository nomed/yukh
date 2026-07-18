# Packaging, releases, and adoption

## Release model

Yukh uses Conventional Commits and release-please. Merges to `main` update a release pull request. Merging that release pull request creates the immutable semantic-version tag and GitHub Release, then refreshes the conventional GitHub Action aliases `latest`, `vX`, and `vX.Y` to point at the same revision.

The release workflow requires **Settings → Actions → General → Workflow permissions → Read and write permissions** and permission for GitHub Actions to create pull requests.

The initial compatibility line is pre-1.0. Breaking changes may occur in minor releases before `1.0.0`; every breaking change must be called out in the changelog. Yukh publishes the full release tag such as `nomed/yukh@v0.1.0` and also updates `nomed/yukh@latest`, `nomed/yukh@v0`, and `nomed/yukh@v0.1`. Consumers that need an immutable pin should use the full tag or a commit SHA.

## Public repository installation

1. Enable GitHub Actions in the consumer repository under **Settings → Actions → General**.
2. Permit the Yukh refs your policy allows: `nomed/yukh@latest`, `nomed/yukh@vX`, `nomed/yukh@vX.Y`, `nomed/yukh@vX.Y.Z`, or a commit SHA, plus the official actions used by the workflow.
3. Copy `examples/minimal/project.yaml` to `.yukh/project.yaml` and adapt field names and mappings.
4. Add the reusable workflow or call the composite action using an immutable release tag.
5. Start in `dry-run` with read-only workflow permissions.
6. Enable apply only after Project access is verified.

## Private repository installation

When Yukh is private, configure **Yukh → Settings → Actions → General → Access** to allow Actions and reusable workflows from the intended repositories or organization. The consumer repository must also allow the private action. Private cross-repository reuse is constrained by GitHub account and plan topology; verify access with a clean workflow before rollout.

A repository `GITHUB_TOKEN` is not automatically sufficient for user- or organization-owned Projects. Prefer a GitHub App installation token with the minimum repository and Project permissions. A fine-grained PAT is a temporary fallback and should be rotated, scoped narrowly, and stored only as a repository or organization secret.

## Permission profiles

Dry-run:

```yaml
permissions:
  contents: read
  issues: read
```

Apply requires a dedicated token capable of reading the issue and reading/writing the target Project. Keep the default `GITHUB_TOKEN` read-only and pass the dedicated token only to the controlled apply workflow.

## Upgrade and rollback

Upgrade by changing the immutable tag in a pull request, running dry-run, reviewing Step Summary diagnostics, and then enabling apply. Roll back by restoring the previous known-good tag. Do not delete old release tags.

## Deprecation and compatibility

Deprecated contract keys or behavior must be documented in the changelog before removal. Before 1.0, compatibility guarantees apply within a pinned release only. From 1.0 onward, breaking behavior requires a major release.

## Removal

Disable issue-event workflows, run a final dry-run, remove the Yukh workflow and `.yukh/project.yaml`, then revoke the GitHub App installation or delete the dedicated secret. Yukh never becomes the authoritative store for issue content, so removal does not require data export.

## Release verification

CI runs `npm run ci`, including type checking, tests, and `npm run verify:package`. The package verification step checks that the release workflow continues to refresh `latest`, `vX`, and `vX.Y` from the release-please semver outputs. A release is accepted only after a clean consumer workflow resolves the intended tag and runs the action without files from `main`.