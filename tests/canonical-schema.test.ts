import { describe, expect, it } from "vitest";
import { classifyProjectFields, desiredProjectSchema, type ExistingBootstrapField } from "../src/bootstrap.js";
import { loadProjectPolicy } from "../src/policy.js";

const source = `version: 1
project: { owner: nomed, repository: example, name: Example }
contract: { marker: yukh, schema: 1 }
bootstrap:
  core:
    enabled: true
  extensions:
    fields:
      area:
        project_field: Area
        required: true
        values:
          governance: Governance
          runtime: Runtime
defaults: { execution: hybrid }
workflow:
  backlog_status: Backlog
  ready_status: Ready
  in_progress_status: In Progress
  review_status: Review
  blocked_status: Blocked
  done_status: Done
scheduling: { automatic_iteration: false }
safety: { overwrite_human_values: false, fail_on_unknown_values: true, comment_on_validation_error: true }
`;

const field = (id: string, name: string, mutability: NonNullable<ExistingBootstrapField["mutability"]>, typename?: string): ExistingBootstrapField => ({
  id,
  name,
  dataType: name === "Estimate" ? "NUMBER" : "SINGLE_SELECT",
  options: [],
  mutability,
  ...(typename ? { typename } : {}),
});

describe("canonical Project schema", () => {
  it("builds the canonical core plus explicit repository extensions", () => {
    const result = loadProjectPolicy(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.bootstrap.coreEnabled).toBe(true);
    expect(result.value.fields.kind).toMatchObject({ projectField: "Work Type", ownership: "core" });
    expect(result.value.fields.priority).toMatchObject({ projectField: "Work Priority", ownership: "core" });
    expect(result.value.fields.size).toMatchObject({ projectField: "Size", ownership: "core" });
    expect(result.value.fields.estimate).toMatchObject({ projectField: "Estimate", ownership: "core", type: "number" });
    expect(result.value.fields.status).toMatchObject({ projectField: "Status", ownership: "core", derived: true });
    expect(result.value.fields.iteration).toMatchObject({ projectField: "Iteration", ownership: "derived", derived: true });
    expect(result.value.fields.area).toMatchObject({ projectField: "Area", ownership: "extension" });

    const schema = desiredProjectSchema(result.value);
    expect(schema.diagnostics).toEqual([]);
    expect(schema.fields.map(({ name }) => name)).toEqual(["Area", "Estimate", "Size", "Status", "Work Priority", "Work Type"]);
    expect(schema.fields.find(({ name }) => name === "Area")?.ownership).toBe("extension");
    expect(schema.fields.find(({ name }) => name === "Work Priority")?.ownership).toBe("core");
  });

  it("classifies unrelated and GitHub-managed fields without mutating them", () => {
    const result = loadProjectPolicy(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const desired = desiredProjectSchema(result.value).fields;
    const classified = classifyProjectFields([
      field("type", "Work Type", "custom"),
      field("area", "Area", "custom"),
      field("status", "Status", "status", "ProjectV2SingleSelectField"),
      field("iteration", "Iteration", "derived", "ProjectV2IterationField"),
      field("external", "Cost Center", "custom"),
    ], desired);

    expect(Object.fromEntries(classified.map(({ field: item, ownership }) => [item.name, ownership]))).toEqual({
      Area: "extension",
      "Cost Center": "external",
      Iteration: "derived",
      Status: "core",
      "Work Type": "core",
    });
  });

  it("keeps legacy policies backward compatible unless core bootstrap is enabled", () => {
    const legacy = loadProjectPolicy(source.replace(/bootstrap:[\s\S]*?defaults:/, "fields:\n  priority: { project_field: Priority, required: true, values: { P0: P0 } }\ndefaults:"));
    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    expect(legacy.value.bootstrap.coreEnabled).toBe(false);
    expect(legacy.value.fields.priority?.projectField).toBe("Priority");
    expect(legacy.value.fields.kind).toBeUndefined();
  });

  it("rejects canonical fields declared as repository extensions", () => {
    const invalid = loadProjectPolicy(source.replace("area:\n        project_field: Area", "priority:\n        project_field: Local Priority"));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.diagnostics.some(({ code }) => code === "core_field_cannot_be_extension")).toBe(true);
  });
});
