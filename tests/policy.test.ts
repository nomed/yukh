import { describe, expect, it } from "vitest";
import { buildDesiredProjectState, loadProjectPolicy } from "../src/policy.js";
import type { IssueContract } from "../src/contract.js";

const POLICY = `
version: 1
project:
  owner: nomed
  repository: uc-rust
  name: uc-rust
contract:
  marker: yukh
  schema: 1
fields:
  kind:
    project_field: Work Type
    required: true
    values: { gate: Gate, task: Task }
  area:
    project_field: Area
    required: true
    values: { governance: Governance }
  priority:
    project_field: Priority
    required: true
    values: { P0: P0, P1: P1 }
  size:
    project_field: Size
    required: true
    values: { S: S, M: M }
  estimate:
    project_field: Estimate
    required: true
    type: number
  iteration:
    project_field: Iteration
milestones: { M0: M0 }
defaults:
  execution: hybrid
scheduling:
  automatic_iteration: true
safety:
  overwrite_human_values: false
  fail_on_unknown_values: true
  comment_on_validation_error: true
`;

const CONTRACT: IssueContract = {
  schema: 1,
  kind: "gate",
  area: "governance",
  priority: "P0",
  milestone: "M0",
  parent: 55,
  children: [],
  dependsOn: [56, 57, 58, 59, 60],
  blocks: [46, 47, 54],
  size: "S",
  estimate: 2,
  iteration: "auto",
  execution: "human",
  extensions: {},
};

describe("loadProjectPolicy", () => {
  it("loads and normalizes the example policy", () => {
    const result = loadProjectPolicy(POLICY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.project).toEqual({ owner: "nomed", repository: "uc-rust", name: "uc-rust" });
    expect(result.value.fields.kind?.values).toEqual({ gate: "Gate", task: "Task" });
    expect(result.value.scheduling.automaticIteration).toBe(true);
  });

  it("rejects malformed YAML", () => {
    const result = loadProjectPolicy("version: [");
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "malformed_policy_yaml", path: "$" }] });
  });

  it("rejects unsupported versions", () => {
    const result = loadProjectPolicy(POLICY.replace("version: 1", "version: 2"));
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "unsupported_policy_version", path: "version" }] });
  });

  it("rejects unknown policy fields with an actionable path", () => {
    const result = loadProjectPolicy(POLICY.replace("fields:\n", "fields:\n  mystery:\n    project_field: Mystery\n"));
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "unknown_policy_field", path: "fields.mystery" }] });
  });

  it("rejects duplicate YAML keys", () => {
    const result = loadProjectPolicy(`${POLICY}\nversion: 1\n`);
    expect(result.ok).toBe(false);
  });
});

describe("buildDesiredProjectState", () => {
  it("builds deterministic desired state for the UC Rust fixture", () => {
    const loaded = loadProjectPolicy(POLICY);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const first = buildDesiredProjectState(CONTRACT, loaded.value);
    const second = buildDesiredProjectState(CONTRACT, loaded.value);
    expect(first).toEqual(second);
    expect(first).toEqual({
      ok: true,
      value: {
        project: { owner: "nomed", repository: "uc-rust", name: "uc-rust" },
        fields: { Area: "Governance", Estimate: 2, Priority: "P0", Size: "S", "Work Type": "Gate" },
        milestone: "M0",
        iteration: { mode: "auto" },
        execution: "human",
        relationships: {
          parent: 55,
          children: [],
          dependsOn: [56, 57, 58, 59, 60],
          blocks: [46, 47, 54],
        },
      },
    });
  });

  it("uses the policy execution default", () => {
    const loaded = loadProjectPolicy(POLICY);
    if (!loaded.ok) throw new Error("policy should load");
    const { execution: _execution, ...withoutExecution } = CONTRACT;
    const result = buildDesiredProjectState(withoutExecution, loaded.value);
    expect(result).toMatchObject({ ok: true, value: { execution: "hybrid" } });
  });

  it("rejects values absent from mappings", () => {
    const loaded = loadProjectPolicy(POLICY);
    if (!loaded.ok) throw new Error("policy should load");
    const result = buildDesiredProjectState({ ...CONTRACT, priority: "P9" }, loaded.value);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "unsupported_contract_value", path: "priority" }] });
  });

  it("reports required values missing from the contract", () => {
    const loaded = loadProjectPolicy(POLICY);
    if (!loaded.ok) throw new Error("policy should load");
    const { size: _size, ...withoutSize } = CONTRACT;
    const result = buildDesiredProjectState(withoutSize, loaded.value);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "missing_policy_required", path: "size" }] });
  });

  it("rejects auto iteration when disabled", () => {
    const loaded = loadProjectPolicy(POLICY.replace("automatic_iteration: true", "automatic_iteration: false"));
    if (!loaded.ok) throw new Error("policy should load");
    const result = buildDesiredProjectState(CONTRACT, loaded.value);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "automatic_iteration_disabled", path: "iteration" }] });
  });
});
