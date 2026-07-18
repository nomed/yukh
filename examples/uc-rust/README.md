# UC Rust external adoption fixture

`nomed/uc-rust` is the first external adopter of Yukh after Yukh completes self-dogfooding.

The fixture contains the UC Rust policy, representative issue contracts, compatibility expectations, migration gate, and acceptance evidence. The installable repository policy is [`project.yaml`](project.yaml).

## Sequence

1. Yukh publishes and verifies an immutable release.
2. Yukh consumes that release on its own repository and proves dry-run, apply, and idempotency.
3. UC Rust installs the same pinned release under `nomed/uc-rust#69`.
4. UC Rust starts in dry-run and does not mutate Project metadata until its migration gate is accepted.

## Minimum compatibility surface

- issue membership in the configured GitHub Project;
- native fields including Status, Priority, Work Type, Area, Size, Estimate, and Iteration;
- parent and sub-issue relationships;
- issue dependencies;
- deterministic drift reporting and safe retry;
- preservation of unmanaged human-owned values.

## Migration gate

Yukh may become the apply engine for UC Rust only when:

1. the policy and issue contract produce the intended Project state;
2. dry-run reports no unexplained drift;
3. first apply succeeds on representative issues;
4. the repeated identical apply performs zero writes;
5. failures are explicit and retryable without corrupting Project state;
6. UC Rust records acceptance and workflow evidence in `nomed/uc-rust#69`.
