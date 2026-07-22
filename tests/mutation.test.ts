import { describe, expect, it } from "vitest";
import {
  SafeProjectMutationAdapter,
  planProjectMutation,
  type ProjectMutationPlan,
} from "../src/mutation.js";
import type { GraphqlTransport, ProjectFieldDefinition } from "../src/project.js";

class SequenceTransport implements GraphqlTransport {
  readonly calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  constructor(private readonly responses: unknown[]) {}

  async execute<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    this.calls.push({ query, variables });
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return response as T;
  }
}

const PRIORITY_FIELD: ProjectFieldDefinition = {
  id: "FIELD_PRIORITY",
  name: "Priority",
  dataType: "SINGLE_SELECT",
  options: [
    { id: "OPTION_P0", name: "P0" },
    { id: "OPTION_P1", name: "P1" },
  ],
  iterations: [],
};

const TARGET = {
  projectId: "PROJECT_1",
  issueContentId: "ISSUE_61",
  field: PRIORITY_FIELD,
  desiredValue: "P0",
};

describe("planProjectMutation", () => {
  it("plans add-item then field update when the item is missing", () => {
    const result = planProjectMutation(TARGET);
    expect(result).toEqual({
      ok: true,
      plan: {
        mode: "dry-run",
        operations: [
          { kind: "add_project_item", projectId: "PROJECT_1", contentId: "ISSUE_61" },
          {
            kind: "set_project_field",
            projectId: "PROJECT_1",
            fieldId: "FIELD_PRIORITY",
            fieldName: "Priority",
            value: { singleSelectOptionId: "OPTION_P0" },
            desiredValue: "P0",
          },
        ],
      },
    });
  });

  it("plans only the field update when an existing item has drift", () => {
    const result = planProjectMutation({
      ...TARGET,
      itemId: "ITEM_61",
      observedValue: "P1",
    });
    expect(result).toMatchObject({
      ok: true,
      plan: {
        operations: [
          {
            kind: "set_project_field",
            itemId: "ITEM_61",
            value: { singleSelectOptionId: "OPTION_P0" },
          },
        ],
      },
    });
  });

  it("produces an empty plan when observed state already matches", () => {
    const result = planProjectMutation({
      ...TARGET,
      itemId: "ITEM_61",
      observedValue: "P0",
    });
    expect(result).toEqual({ ok: true, plan: { mode: "dry-run", operations: [] } });
  });

  it("rejects unsupported single-select mappings before writes", () => {
    const result = planProjectMutation({ ...TARGET, desiredValue: "P9" });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "unsupported_field_mapping", path: "fields.Priority" }],
    });
  });

  it("plans GitHub DATE mutations and rejects impossible dates", () => {
    const field: ProjectFieldDefinition = { id: "FIELD_DATE", name: "Start date", dataType: "DATE", options: [], iterations: [] };
    expect(planProjectMutation({ ...TARGET, field, desiredValue: "2026-07-22" })).toMatchObject({
      ok: true,
      plan: { operations: [expect.anything(), { kind: "set_project_field", value: { date: "2026-07-22" } }] },
    });
    expect(planProjectMutation({ ...TARGET, field, desiredValue: "2026-02-30" })).toMatchObject({
      ok: false,
      diagnostics: [{ code: "unsupported_field_value", path: "fields.Start date" }],
    });
  });
});

describe("SafeProjectMutationAdapter", () => {
  it("adds a missing item and sets its field", async () => {
    const planned = planProjectMutation(TARGET);
    if (!planned.ok) throw new Error("plan should be valid");
    const transport = new SequenceTransport([
      { addProjectV2ItemById: { item: { id: "ITEM_61" } } },
      { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM_61" } } },
    ]);

    const result = await new SafeProjectMutationAdapter(transport).apply(planned.plan);

    expect(result).toEqual({
      ok: true,
      applied: [
        { operation: "add_project_item", itemId: "ITEM_61" },
        { operation: "set_project_field", itemId: "ITEM_61" },
      ],
      diagnostics: [],
      retryable: false,
      itemId: "ITEM_61",
    });
    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[1]?.variables).toMatchObject({
      itemId: "ITEM_61",
      value: { singleSelectOptionId: "OPTION_P0" },
    });
  });

  it("performs no writes for an empty idempotent plan", async () => {
    const transport = new SequenceTransport([]);
    const plan: ProjectMutationPlan = { mode: "dry-run", operations: [] };
    const result = await new SafeProjectMutationAdapter(transport).apply(plan);
    expect(result).toEqual({ ok: true, applied: [], diagnostics: [], retryable: false });
    expect(transport.calls).toHaveLength(0);
  });

  it("returns a retryable partial failure after adding the item", async () => {
    const planned = planProjectMutation(TARGET);
    if (!planned.ok) throw new Error("plan should be valid");
    const transport = new SequenceTransport([
      { addProjectV2ItemById: { item: { id: "ITEM_61" } } },
      new Error("gateway timeout"),
    ]);

    const result = await new SafeProjectMutationAdapter(transport).apply(planned.plan);

    expect(result).toMatchObject({
      ok: false,
      applied: [{ operation: "add_project_item", itemId: "ITEM_61" }],
      diagnostics: [{ code: "project_mutation_failed", path: "fields.Priority" }],
      retryable: true,
      itemId: "ITEM_61",
    });
  });

  it("normalizes permission failures", async () => {
    const planned = planProjectMutation(TARGET);
    if (!planned.ok) throw new Error("plan should be valid");
    const result = await new SafeProjectMutationAdapter(
      new SequenceTransport([new Error("Resource not accessible by integration")]),
    ).apply(planned.plan);
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "project_mutation_permission_denied", path: "projectItem" }],
      retryable: true,
    });
  });
});
