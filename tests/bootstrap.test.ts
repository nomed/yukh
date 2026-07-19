import { describe, expect, it } from "vitest";
import {
  desiredProjectSchema,
  mergeBootstrapOptions,
  planProjectBootstrap,
  runProjectBootstrap,
  type ExistingBootstrapField,
} from "../src/bootstrap.js";
import { loadProjectPolicy } from "../src/policy.js";
import type { GraphqlTransport } from "../src/project.js";

const policySource = `version: 1
project:
  owner: nomed
  repository: example
  name: Example
contract:
  marker: yukh
  schema: 1
fields:
  kind:
    project_field: Work Type
    required: true
    values: { feature: Feature, task: Task }
  priority:
    project_field: Priority
    required: true
    values: { P0: P0, P1: P1 }
  estimate:
    project_field: Estimate
    type: number
  status:
    project_field: Status
    derived: true
defaults:
  execution: hybrid
scheduling:
  automatic_iteration: false
safety:
  overwrite_human_values: false
  fail_on_unknown_values: true
  comment_on_validation_error: true
`;

describe("Project bootstrap planner", () => {
  it("derives supported Project schema from policy", () => {
    const policy = loadProjectPolicy(policySource);
    expect(policy.ok).toBe(true);
    if (!policy.ok) return;
    const desired = desiredProjectSchema(policy.value);
    expect(desired.diagnostics).toEqual([]);
    expect(desired.fields.map(({ name, dataType }) => ({ name, dataType }))).toEqual([
      { name: "Estimate", dataType: "NUMBER" },
      { name: "Priority", dataType: "SINGLE_SELECT" },
      { name: "Work Type", dataType: "SINGLE_SELECT" },
    ]);
  });

  it("appends missing options and preserves unrelated options", () => {
    const merged = mergeBootstrapOptions(
      [
        { id: "O_FEATURE", name: "Feature", color: "BLUE", description: "human" },
        { id: "O_BUG", name: "Bug", color: "RED", description: "manual" },
      ],
      [
        { name: "Feature", color: "GRAY", description: "" },
        { name: "Task", color: "BLUE", description: "" },
      ],
    );
    expect(merged.changed).toBe(true);
    expect(merged.missing).toEqual(["Task"]);
    expect(merged.preserved).toEqual(["Bug"]);
    expect(merged.options.map(({ name }) => name)).toEqual(["Feature", "Task", "Bug"]);
    expect(merged.options[0]).toMatchObject({ id: "O_FEATURE", color: "BLUE", description: "human" });
  });

  it("fails safely on an incompatible same-name field", () => {
    const existing: ExistingBootstrapField[] = [{ id: "F_PRIORITY", name: "Priority", dataType: "NUMBER", options: [] }];
    const planned = planProjectBootstrap(existing, [{
      name: "Priority",
      dataType: "SINGLE_SELECT",
      options: [{ name: "P0", color: "GRAY", description: "" }],
    }]);
    expect(planned.ok).toBe(false);
    expect(planned.diagnostics[0]?.code).toBe("incompatible_project_field_type");
    expect(planned.plan.operations).toEqual([]);
  });
});

class BootstrapTransport implements GraphqlTransport {
  readonly calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  constructor(private readonly converged = false, private readonly failMutation = false) {}

  async execute<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    this.calls.push({ query, variables });
    if (query.includes("BootstrapProject")) {
      return {
        repositoryOwner: {
          projectV2: {
            id: "PVT_1",
            title: "Example",
            fields: {
              nodes: this.converged ? [
                { id: "F_EST", name: "Estimate", dataType: "NUMBER" },
                { id: "F_PRIORITY", name: "Priority", dataType: "SINGLE_SELECT", options: [{ id: "O_P0", name: "P0", color: "GRAY", description: "" }, { id: "O_P1", name: "P1", color: "BLUE", description: "" }] },
                { id: "F_TYPE", name: "Work Type", dataType: "SINGLE_SELECT", options: [{ id: "O_FEATURE", name: "Feature", color: "GRAY", description: "" }, { id: "O_TASK", name: "Task", color: "BLUE", description: "" }] },
              ] : [
                { id: "F_PRIORITY", name: "Priority", dataType: "SINGLE_SELECT", options: [{ id: "O_P0", name: "P0", color: "GRAY", description: "" }] },
              ],
            },
          },
        },
      } as T;
    }
    if (this.failMutation) throw new Error("gateway timeout");
    return {} as T;
  }
}

describe("Project bootstrap runtime", () => {
  it("dry-run plans deterministic operations without writes", async () => {
    const transport = new BootstrapTransport(false);
    const result = await runProjectBootstrap({ policySource, projectNumber: 3, mode: "dry-run", tokenAvailable: true }, transport);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(0);
    expect(result.plan.operations.map(({ kind }) => kind)).toEqual(["create-field", "update-options", "create-field"]);
    expect(transport.calls.filter(({ query }) => query.includes("mutation"))).toHaveLength(0);
  });

  it("apply performs planned operations", async () => {
    const transport = new BootstrapTransport(false);
    const result = await runProjectBootstrap({ policySource, projectNumber: 3, mode: "apply", applyEnabled: true, tokenAvailable: true }, transport);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(3);
    expect(result.remaining).toEqual([]);
    expect(transport.calls.filter(({ query }) => query.includes("mutation"))).toHaveLength(3);
  });

  it("second apply reports zero operations", async () => {
    const transport = new BootstrapTransport(true);
    const result = await runProjectBootstrap({ policySource, projectNumber: 3, mode: "apply", applyEnabled: true, tokenAvailable: true }, transport);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(0);
    expect(result.plan.operations).toEqual([]);
    expect(result.remaining).toEqual([]);
  });

  it("requires explicit apply authorization", async () => {
    const transport = new BootstrapTransport(false);
    const result = await runProjectBootstrap({ policySource, projectNumber: 3, mode: "apply", tokenAvailable: true }, transport);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("apply_not_enabled");
    expect(transport.calls).toHaveLength(0);
  });

  it("returns remaining operations after mutation failure", async () => {
    const transport = new BootstrapTransport(false, true);
    const result = await runProjectBootstrap({ policySource, projectNumber: 3, mode: "apply", applyEnabled: true, tokenAvailable: true }, transport);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(0);
    expect(result.remaining).toHaveLength(3);
    expect(result.diagnostics[0]?.code).toBe("project_bootstrap_mutation_failed");
  });
});
