# Expected UC Rust projection

The compatibility fixture must project at least the following state:

- exact managed repository labels;
- managed milestones and issue assignments;
- membership of every governed issue in user Project #4;
- native Project fields `Status`, `Priority`, `Type`, `Area`, `Release` and `Size`;
- parent/sub-issue graph;
- issue dependency graph;
- deterministic drift diagnostics.

A report must identify each difference with:

- entity identity;
- property;
- desired value;
- actual value;
- severity;
- supported remediation;
- provenance from the input model.

No difference may be silently ignored.
