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
    project_field: Type
    target: issue_type
    required: true
    values: { gate: Gate, task: Task }
  area:
    project_field: Area
    required: true
    values: { governance: Governance }
  priority:
    project_field: Priority
    target: issue_field
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
  component:
    project_field: Component
    ownership: extension
    required: true
    values: { edge: Edge, hub: Hub, shared: Shared }
  start_date:
    project_field: Start date
    ownership: extension
    type: date
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
  extensions: { component: "edge" },
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

  it("parses explicit native targets and rejects unsafe combinations", () => {
    const loaded = loadProjectPolicy(POLICY);
    expect(loaded).toMatchObject({ ok: true, value: { fields: { kind: { target: "issue_type" }, priority: { target: "issue_field" }, component: { target: "project_field" } } } });
    expect(loadProjectPolicy(POLICY.replace("target: issue_type", "target: other"))).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: "unsupported_policy_value", path: "fields.kind.target" })]) });
    expect(loadProjectPolicy(POLICY.replace("project_field: Priority\n    target: issue_field", "project_field: Priority\n    target: issue_type"))).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: "incompatible_policy_target", path: "fields.priority.target" })]) });
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
        fields: { Area: "Governance", Component: "Edge", Estimate: 2, Size: "S" },
        native: { issueType: "Gate", issueFields: { Priority: "P0" } },
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

  it("fails closed for undeclared extensions and unknown extension values", () => {
    const loaded = loadProjectPolicy(POLICY);
    if (!loaded.ok) throw new Error("policy should load");
    expect(buildDesiredProjectState({ ...CONTRACT, extensions: { component: "agent" } }, loaded.value))
      .toMatchObject({ ok: false, diagnostics: [{ code: "unsupported_contract_value", path: "extensions.component" }] });
    expect(buildDesiredProjectState({ ...CONTRACT, extensions: { component: "edge", mystery: "x" } }, loaded.value))
      .toMatchObject({ ok: false, diagnostics: [{ code: "undeclared_extension", path: "extensions.mystery" }] });
  });

  it("requires policy-declared extensions", () => {
    const loaded = loadProjectPolicy(POLICY);
    if (!loaded.ok) throw new Error("policy should load");
    expect(buildDesiredProjectState({ ...CONTRACT, extensions: {} }, loaded.value))
      .toMatchObject({ ok: false, diagnostics: [{ code: "missing_policy_required", path: "extensions.component" }] });
  });

  it("accepts real ISO date extensions and rejects malformed calendar dates", () => {
    const loaded = loadProjectPolicy(POLICY);
    if (!loaded.ok) throw new Error("policy should load");
    expect(buildDesiredProjectState({ ...CONTRACT, extensions: { ...CONTRACT.extensions, start_date: "2026-07-22" } }, loaded.value))
      .toMatchObject({ ok: true, value: { fields: { "Start date": "2026-07-22" } } });
    expect(buildDesiredProjectState({ ...CONTRACT, extensions: { ...CONTRACT.extensions, start_date: "2026-02-30" } }, loaded.value))
      .toMatchObject({ ok: false, diagnostics: [{ code: "invalid_date_value", path: "extensions.start_date" }] });
  });

  it("rejects select options on date fields", () => {
    expect(loadProjectPolicy(POLICY.replace("type: date", "type: date\n    values: { now: Today }")))
      .toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: "incompatible_policy_values", path: "fields.start_date.values" })]) });
  });

  it("rejects auto iteration when disabled", () => {
    const loaded = loadProjectPolicy(POLICY.replace("automatic_iteration: true", "automatic_iteration: false"));
    if (!loaded.ok) throw new Error("policy should load");
    const result = buildDesiredProjectState(CONTRACT, loaded.value);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "automatic_iteration_disabled", path: "iteration" }] });
  });
});
