import { describe, expect, it } from "vitest";
import { buildEffectiveProjectSchema, isYukhManagedField } from "../src/effective-schema.js";
import { loadProjectPolicy } from "../src/policy.js";

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

describe("effective Project schema", () => {
  it("classifies canonical fields, repository Area and derived fields", () => {
    const parsed = loadProjectPolicy(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const schema = buildEffectiveProjectSchema(parsed.value);
    const ownership = Object.fromEntries(schema.fields.map((field) => [field.logicalName, field.ownership]));

    expect(ownership).toEqual({
      area: "extension",
      estimate: "core",
      iteration: "derived",
      kind: "core",
      priority: "core",
      size: "core",
      status: "derived",
    });
  });

  it("allows writes only to core and extension fields", () => {
    const parsed = loadProjectPolicy(source);
    if (!parsed.ok) throw new Error("policy must parse");
    const schema = buildEffectiveProjectSchema(parsed.value);

    expect(schema.fields.filter(isYukhManagedField).map((field) => field.projectField)).toEqual([
      "Area",
      "Estimate",
      "Size",
      "Work Priority",
      "Work Type",
    ]);
    expect(schema.fields.filter((field) => !isYukhManagedField(field)).map((field) => field.projectField)).toEqual([
      "Iteration",
      "Status",
    ]);
  });
});
