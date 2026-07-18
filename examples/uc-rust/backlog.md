# UC Rust compatibility backlog

## Epic — UC Rust governance compatibility

### Contract and fixtures

Capture representative UC Rust governance manifests, expected projection semantics and unsupported behavior.

### Read-only drift engine

Compute deterministic desired-versus-actual differences for repository metadata, Project fields and issue graph.

### GitHub repository adapter

Read and later reconcile labels, milestones and issue metadata.

### GitHub Project v2 adapter

Read and later reconcile item membership and native fields Status, Priority, Type, Area, Release and Size.

### Native relation adapter

Read and later reconcile parent/sub-issues and issue dependencies.

### Sandbox reconciliation

Prove idempotency, diagnostics, failure safety and rollback in a disposable repository.

### UC Rust shadow comparison

Run read-only comparison against UC Rust and reach zero unexplained drift before migration.
