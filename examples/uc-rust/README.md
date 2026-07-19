# UC Rust external adoption fixture

`nomed/uc-rust` is the first planned external adopter of Yukh. Yukh self-dogfooding has completed successfully, including a repeated apply with zero operations.

The fixture contains the UC Rust policy, representative issue contracts, compatibility expectations, migration gate, and acceptance checklist. The installable repository policy is [`project.yaml`](project.yaml).

## Current sequence

1. Yukh has published and verified versioned immutable releases.
2. Yukh has consumed its own released action and proven apply idempotency.
3. UC Rust installs a verified pinned release under `nomed/uc-rust#69`.
4. UC Rust starts in dry-run and does not mutate Project metadata until its migration gate is accepted.

## Minimum compatibility surface

- issue membership in the configured GitHub Project;
- native fields including Status, Priority, Work Type, Area, Size, Estimate, and Iteration;
- parent and sub-issue relationships;
- issue dependencies;
- deterministic drift reporting and safe retry;
- preservation of unmanaged human-owned values.

Repository labels, milestones, and UC Rust legacy synchronization scripts are not implied capabilities of this first adoption fixture.

## Migration gate

Yukh may become the apply engine for UC Rust only when:

1. the policy and issue contract produce the intended Project state;
2. dry-run reports no unexplained drift;
3. first apply succeeds on representative issues;
4. the repeated identical apply performs zero writes;
5. failures are explicit and retryable without corrupting Project state;
6. UC Rust records acceptance and workflow evidence in `nomed/uc-rust#69`.