import { describe, expect, it } from "vitest";
import { ReadOnlyProjectAdapter, type GraphqlTransport } from "../src/project.js";

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

function project(overrides: Record<string, unknown> = {}): any {
  return {
    organization: {
      projectV2: {
        id: "PVT_1",
        number: 7,
        title: "UC Rust",
        fields: {
          nodes: [
            { __typename: "ProjectV2Field", id: "F_EST", name: "Estimate", dataType: "NUMBER" },
            {
              __typename: "ProjectV2SingleSelectField",
              id: "F_PRI",
              name: "Priority",
              dataType: "SINGLE_SELECT",
              options: [{ id: "O1", name: "P1" }, { id: "O0", name: "P0" }],
            },
            {
              __typename: "ProjectV2IterationField",
              id: "F_ITER",
              name: "Iteration",
              dataType: "ITERATION",
              configuration: {
                iterations: [{ id: "I2", title: "Iteration 2", startDate: "2026-08-01", duration: 14 }],
                completedIterations: [{ id: "I1", title: "Iteration 1", startDate: "2026-07-18", duration: 14 }],
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        items: {
          nodes: [
            {
              id: "ITEM_61",
              content: { __typename: "Issue", number: 61, repository: { nameWithOwner: "nomed/uc-rust" } },
              fieldValues: {
                nodes: [
                  { __typename: "ProjectV2ItemFieldNumberValue", number: 2, field: { name: "Estimate" } },
                  { __typename: "ProjectV2ItemFieldSingleSelectValue", name: "P0", field: { name: "Priority" } },
                  { __typename: "ProjectV2ItemFieldIterationValue", title: "Iteration 1", field: { name: "Iteration" } },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        ...overrides,
      },
    },
    user: null,
  };
}

const INPUT = { owner: "nomed", projectNumber: 7, repository: "nomed/uc-rust", issueNumber: 61 };

describe("ReadOnlyProjectAdapter", () => {
  it("resolves project metadata, fields, options, iterations and observed values", async () => {
    const adapter = new ReadOnlyProjectAdapter(new SequenceTransport([project()]));
    const result = await adapter.discover(INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.project).toEqual({ id: "PVT_1", number: 7, title: "UC Rust", owner: "nomed" });
    expect(result.value.fields.map(({ name }) => name)).toEqual(["Estimate", "Iteration", "Priority"]);
    expect(result.value.fields.find(({ name }) => name === "Priority")?.options.map(({ name }) => name)).toEqual(["P0", "P1"]);
    expect(result.value.fields.find(({ name }) => name === "Iteration")?.iterations.map(({ title }) => title)).toEqual(["Iteration 1", "Iteration 2"]);
    expect(result.value.issueItem).toEqual({
      present: true,
      id: "ITEM_61",
      values: { Estimate: 2, Iteration: "Iteration 1", Priority: "P0" },
      iteration: "Iteration 1",
    });
    expect(result.value.observed).toMatchObject({
      projectItemPresent: true,
      fields: { Estimate: 2, Iteration: "Iteration 1", Priority: "P0" },
      iteration: "Iteration 1",
    });
  });

  it("distinguishes a missing issue item from a missing project", async () => {
    const response = project({ items: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } });
    const result = await new ReadOnlyProjectAdapter(new SequenceTransport([response])).discover(INPUT);
    expect(result).toMatchObject({ ok: true, value: { issueItem: { present: false, values: {} }, observed: { projectItemPresent: false } } });
  });

  it("supports user-owned Projects after an organization lookup failure", async () => {
    const response = project();
    const node = response.organization.projectV2;
    const transport = new SequenceTransport([
      new Error("Could not resolve to an Organization with the login of 'nomed'."),
      { organization: null, user: { projectV2: node } },
    ]);
    const result = await new ReadOnlyProjectAdapter(transport).discover(INPUT);
    expect(result).toMatchObject({ ok: true, value: { project: { owner: "nomed", title: "UC Rust" } } });
    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[0]?.query).toContain("DiscoverOrganizationProject");
    expect(transport.calls[1]?.query).toContain("DiscoverUserProject");
  });

  it("follows Project field and item pagination", async () => {
    const first = project();
    first.organization.projectV2.fields.nodes = [{ __typename: "ProjectV2Field", id: "F_EST", name: "Estimate", dataType: "NUMBER" }];
    first.organization.projectV2.fields.pageInfo = { hasNextPage: true, endCursor: "FIELDS_2" };
    first.organization.projectV2.items.nodes = [];
    first.organization.projectV2.items.pageInfo = { hasNextPage: true, endCursor: "ITEMS_2" };

    const second = project();
    second.organization.projectV2.fields.nodes = [{ __typename: "ProjectV2SingleSelectField", id: "F_PRI", name: "Priority", dataType: "SINGLE_SELECT", options: [{ id: "O0", name: "P0" }] }];
    second.organization.projectV2.fields.pageInfo = { hasNextPage: false, endCursor: null };

    const transport = new SequenceTransport([first, second]);
    const result = await new ReadOnlyProjectAdapter(transport).discover(INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[1]?.variables).toMatchObject({ fieldsCursor: "FIELDS_2", itemsCursor: "ITEMS_2" });
    expect(result.value.fields.map(({ name }) => name)).toEqual(["Estimate", "Priority"]);
    expect(result.value.issueItem.present).toBe(true);
  });

  it("returns an actionable not-found diagnostic", async () => {
    const result = await new ReadOnlyProjectAdapter(new SequenceTransport([{ organization: { projectV2: null } }])).discover(INPUT);
    expect(result).toEqual({ ok: false, diagnostics: [{ code: "project_not_found", message: "Project #7 was not found for 'nomed'", path: "project" }] });
  });

  it("normalizes permission failures", async () => {
    const result = await new ReadOnlyProjectAdapter(new SequenceTransport([new Error("Resource not accessible by integration")])).discover(INPUT);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "project_permission_denied", path: "project" }] });
  });

  it("normalizes generic API failures", async () => {
    const result = await new ReadOnlyProjectAdapter(new SequenceTransport([new Error("gateway timeout")])).discover(INPUT);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "project_api_error", path: "project" }] });
  });

  it("rejects invalid discovery input before calling GitHub", async () => {
    const transport = new SequenceTransport([]);
    const result = await new ReadOnlyProjectAdapter(transport).discover({ ...INPUT, repository: "uc-rust", issueNumber: 0 });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "invalid_project_input", path: "project" }] });
    expect(transport.calls).toHaveLength(0);
  });
});
