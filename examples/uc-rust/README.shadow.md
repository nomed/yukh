# Shadow execution contract

During shadow mode Yukh is read-only against UC Rust.

Allowed:

- read manifests and repository state;
- read GitHub Project state;
- compute desired state;
- emit drift and comparison reports;
- classify unsupported behavior.

Forbidden:

- mutate labels, milestones, issues or Project fields;
- create parent/sub-issue relationships;
- remove unmanaged metadata;
- alter UC Rust manifests;
- claim migration readiness without evidence.
