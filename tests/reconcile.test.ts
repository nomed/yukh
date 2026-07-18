import { describe, expect, it } from "vitest";
import type { GraphqlTransport, DiscoveredProjectState } from "../src/project.js";
import type { DesiredProjectState, ProjectPolicy } from "../src/policy.js";
import { SafeProjectMutationAdapter } from "../src/mutation.js";
import {
  applyCompleteProjectReconciliation,
  planCompleteProjectReconciliation,
} from "../src/reconcile.js";

const policy: ProjectPolicy = {
  version: 1,
  project: { owner: "nomed", repository: "uc-rust", name: "UC Rust" },
  contract: { marker: "yukh", schema: 1 },
  fields: {
    priority: { projectField: "Priority", required: true, type: "string", derived: false, values: { P0: "P0" } },
    estimate: { projectField: "Estimate", required: false, type: "number", derived: false, values: {} },
    iteration: { projectField: "Iteration", required: false, type: "string", derived: false, values: {} },
    status: { projectField: "Status", required: false, type: "string", derived: true, values: {} },
  },
  milestones: {},
  defaults: { execution: "hybrid" },
  scheduling: { automaticIteration: true },
  safety: { overwriteHumanValues: false, failOnUnknownValues: true, commentOnValidationError: true },
};

const desired: DesiredProjectState = {
  project: { owner: "nomed", repository: "uc-rust", name: "UC Rust" },
  fields: { Estimate: 2, Priority: "P0" },
  iteration: { mode: "auto" },
  execution: "human",
  relationships: { children: [], dependsOn: [60], blocks: [] },
};

function discovered(overrides: Partial<DiscoveredProjectState["issueItem"]> = {}): DiscoveredProjectState {
  return {
    project: { id: "PVT_1", number: 7, title: "UC Rust", owner: "nomed" },
    fields: [
      { id: "F_EST", name: "Estimate", dataType: "NUMBER", options: [], iterations: [] },
      {
        id: "F_ITER",
        name: "Iteration",
        dataType: "ITERATION",
        options: [],
        iterations: [
          { id: "I1", title: "Iteration 1", startDate: "2026-07-01", duration: 14 },
          { id: "I2", title: "Iteration 2", startDate: "2026-08-01", duration: 14 },
        ],
      },
      { id: "F_PRI", name: "Priority", dataType: "SINGLE_SELECT", options: [{ id: "O0", name: "P0" }], iterations: [] },
      { id: "F_STATUS", name: "Status", dataType: "SINGLE_SELECT", options: [{ id: "OS", name: "Blocked" }, { id: "OR", name: "Ready" }], iterations: [] },
    ],
    issueItem: {
      present: false,
      values: {},
      ...overrides,
    },
    observed: { projectItemPresent: false, fields: {}, relationships: { children: [], dependsOn: [], blocks: [] } },
  };
}

class SequenceTransport implements GraphqlTransport {
  readonly calls: Array<Record<string, unknown>> = [];
  constructor(private readonly responses: unknown[]) {}
  async execute<T>(_query: string, variables: Record<string, unknown>): Promise<T> {
    this.calls.push(variables);
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return response as T;
  }
}

describe("complete Project reconciliation", () => {
  it("plans a missing item and all drifted managed fields in stable order", () => {
    const result = planCompleteProjectReconciliation({
      desired,
      policy,
      discovered: discovered(),
      issueContentId: "ISSUE_61",
      now: "2026-07-18",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.operations.map((operation) => operation.kind === "add_project_item" ? "add" : operation.fieldName)).toEqual([
      "add",
      "Estimate",
      "Iteration",
      "Priority",
      "Status",
    ]);
    expect(result.plan.operations[2]).toMatchObject({ value: { iterationId: "I2" }, desiredValue: "Iteration 2" });
    expect(result.plan.operations[4]).toMatchObject({ desiredValue: "Blocked" });
  });

  it("produces a no-op when all managed values match", () => {
    const state = discovered({
      present: true,
      id: "ITEM_61",
      values: { Estimate: 2, Iteration: "Iteration 2", Priority: "P0", Status: "Blocked" },
    });
    const result = planCompleteProjectReconciliation({ desired, policy, discovered: state, issueContentId: "ISSUE_61", now: "2026-07-18" });
    expect(result).toMatchObject({ ok: true, plan: { operations: [] } });
  });

  it("preserves unmanaged human-owned fields with a warning", () => {
    const state = discovered({ present: true, id: "ITEM_61", values: { Owner: "Alice" } });
    const result = planCompleteProjectReconciliation({ desired, policy, discovered: state, issueContentId: "ISSUE_61", now: "2026-07-18" });
    expect(result).toMatchObject({ ok: true, plan: { warnings: [{ code: "preserved_human_owned_field", path: "fields.Owner" }] } });
    if (result.ok) expect(result.plan.operations.some((operation) => operation.kind === "set_project_field" && operation.fieldName === "Owner")).toBe(false);
  });

  it("fails safely for missing and ambiguous mappings", () => {
    const state = discovered();
    state.fields = state.fields.filter(({ name }) => name !== "Estimate");
    const priority = state.fields.find(({ name }) => name === "Priority")!;
    priority.options.push({ id: "O0_DUP", name: "P0" });
    const result = planCompleteProjectReconciliation({ desired, policy, discovered: state, issueContentId: "ISSUE_61", now: "2026-07-18" });
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "project_field_not_found", path: "fields.Estimate" }),
      expect.objectContaining({ code: "ambiguous_field_mapping", path: "fields.Priority" }),
    ]));
  });

  it("applies all operations and returns no remaining work", async () => {
    const planned = planCompleteProjectReconciliation({ desired, policy, discovered: discovered(), issueContentId: "ISSUE_61", now: "2026-07-18" });
    if (!planned.ok) throw new Error("plan should succeed");
    const transport = new SequenceTransport([
      { addProjectV2ItemById: { item: { id: "ITEM_61" } } },
      ...Array.from({ length: 4 }, () => ({ updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM_61" } } })),
    ]);
    const result = await applyCompleteProjectReconciliation(new SafeProjectMutationAdapter(transport), planned.plan);
    expect(result).toMatchObject({ ok: true, applied: 5, remaining: [], retryable: false, itemId: "ITEM_61" });
  });

  it("preserves completed and remaining operations after a partial failure", async () => {
    const planned = planCompleteProjectReconciliation({ desired, policy, discovered: discovered(), issueContentId: "ISSUE_61", now: "2026-07-18" });
    if (!planned.ok) throw new Error("plan should succeed");
    const transport = new SequenceTransport([
      { addProjectV2ItemById: { item: { id: "ITEM_61" } } },
      { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM_61" } } },
      new Error("gateway timeout"),
    ]);
    const result = await applyCompleteProjectReconciliation(new SafeProjectMutationAdapter(transport), planned.plan);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(2);
    expect(result.remaining).toHaveLength(3);
    expect(result).toMatchObject({ retryable: true, diagnostics: [{ code: "project_mutation_failed" }], itemId: "ITEM_61" });
  });
});
