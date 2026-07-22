import { describe, expect, it } from "vitest";
import { desiredProjectSchema } from "../src/bootstrap.js";
import { parseIssueContract } from "../src/contract.js";
import { buildEffectiveProjectSchema, isYukhManagedField } from "../src/effective-schema.js";
import { buildDesiredProjectState, loadProjectPolicy } from "../src/policy.js";

const source = `version: 1
project: { owner: nomed, repository: example, name: Example }
contract: { marker: yukh, schema: 1 }
fields:
  kind: { project_field: Work Type, required: true, values: { epic: Epic, task: Task } }
  area: { project_field: Area, required: true, values: { runtime: Runtime } }
  priority: { project_field: Work Priority, required: true, values: { P0: P0, P1: P1 } }
  size: { project_field: Size, values: { S: S, M: M } }
  estimate: { project_field: Estimate, type: number }
  iteration: { project_field: Iteration, derived: true }
  status: { project_field: Status, derived: true }
defaults: { execution: hybrid }
`;

const explicitSource = `version: 1
project: { owner: nomed, repository: example, name: Example }
contract: { marker: yukh, schema: 1 }
fields:
  kind: { project_field: Work Type, required: true, ownership: core, values: { task: Task } }
  area: { project_field: Area, ownership: external, values: { runtime: Runtime } }
  priority: { project_field: Work Priority, ownership: extension, values: { P1: P1 } }
  status: { project_field: Status, ownership: external }
defaults: { execution: hybrid }
`;

const issue = `<!-- yukh
schema: 1
kind: task
area: runtime
priority: P1
-->

Example
`;

describe("effective Project schema", () => {
  it("classifies canonical fields, repository Area and built-in fields", () => {
    const parsed = loadProjectPolicy(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const schema = buildEffectiveProjectSchema(parsed.value);
    const ownership = Object.fromEntries(schema.fields.map((field) => [field.logicalName, field.ownership]));

    expect(ownership).toEqual({
      area: "extension",
      estimate: "core",
      iteration: "core",
      kind: "core",
      priority: "core",
      size: "core",
      status: "core",
    });
  });

  it("allows writes only to core and extension fields", () => {
    const parsed = loadProjectPolicy(source);
    if (!parsed.ok) throw new Error("policy must parse");
    const schema = buildEffectiveProjectSchema(parsed.value);

    expect(schema.fields.filter(isYukhManagedField).map((field) => field.projectField)).toEqual([
      "Area",
      "Estimate",
      "Iteration",
      "Size",
      "Status",
      "Work Priority",
      "Work Type",
    ]);
    expect(schema.fields.filter((field) => !isYukhManagedField(field)).map((field) => field.projectField)).toEqual([]);
  });

  it("honors explicit ownership without breaking version 1 policies", () => {
    const parsed = loadProjectPolicy(explicitSource);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const schema = buildEffectiveProjectSchema(parsed.value);
    expect(Object.fromEntries(schema.fields.map((field) => [field.logicalName, field.ownership]))).toEqual({
      area: "external",
      kind: "core",
      priority: "extension",
      status: "external",
    });
  });

  it("excludes external fields from bootstrap and issue reconciliation", () => {
    const policy = loadProjectPolicy(explicitSource);
    const contract = parseIssueContract(issue);
    expect(policy.ok).toBe(true);
    expect(contract.ok).toBe(true);
    if (!policy.ok || !contract.ok) return;

    expect(desiredProjectSchema(policy.value).fields.map(({ name }) => name)).toEqual([
      "Work Priority",
      "Work Type",
    ]);

    const desired = buildDesiredProjectState(contract.contract, policy.value);
    expect(desired.ok).toBe(true);
    if (!desired.ok) return;
    expect(desired.value.fields).toEqual({
      "Work Priority": "P1",
      "Work Type": "Task",
    });
  });

  it("excludes issue-backed fields from custom Project bootstrap", () => {
    const parsed = loadProjectPolicy(source
      .replace("project_field: Work Type", "project_field: Type, target: issue_type")
      .replace("project_field: Work Priority", "project_field: Priority, target: issue_field"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(desiredProjectSchema(parsed.value).fields.map(({ name }) => name)).not.toEqual(expect.arrayContaining(["Type", "Priority"]));
  });

  it("rejects conflicting derived declarations", () => {
    const parsed = loadProjectPolicy(explicitSource.replace("ownership: core", "ownership: core, derived: true"));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.diagnostics.some(({ code }) => code === "conflicting_field_ownership")).toBe(true);
  });
});
