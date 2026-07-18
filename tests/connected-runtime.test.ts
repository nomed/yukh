import { describe, expect, it } from "vitest";
import type { GraphqlTransport } from "../src/project.js";
import { GitHubGraphqlTransport, runConnectedActionRuntime, type FetchLike } from "../src/connected-runtime.js";

const issueBody = `# Connected runtime

<!-- yukh
schema: 1
kind: feature
area: platform
priority: P1
estimate: 3
-->`;

const policySource = `version: 1
project:
  owner: nomed
  repository: yukh
  name: Yukh
contract:
  marker: yukh
  schema: 1
fields:
  kind:
    project_field: Type
    required: true
    type: string
    derived: false
    values: { feature: Feature }
  area:
    project_field: Area
    required: true
    type: string
    derived: false
    values: {}
  priority:
    project_field: Priority
    required: true
    type: string
    derived: false
    values: { P1: P1 }
  estimate:
    project_field: Estimate
    required: false
    type: number
    derived: false
    values: {}
defaults:
  execution: hybrid
scheduling:
  automatic_iteration: false
safety:
  overwrite_human_values: false
  fail_on_unknown_values: true
  comment_on_validation_error: true
`;

const issueResponse = { repository: { issue: { id: "ISSUE_27", number: 27, body: issueBody } } };

function projectResponse(present = false) {
  return {
    organization: {
      projectV2: {
        id: "PVT_1",
        number: 1,
        title: "Yukh",
        fields: {
          nodes: [
            { __typename: "ProjectV2SingleSelectField", id: "F_TYPE", name: "Type", dataType: "SINGLE_SELECT", options: [{ id: "O_FEATURE", name: "Feature" }] },
            { __typename: "ProjectV2Field", id: "F_AREA", name: "Area", dataType: "TEXT" },
            { __typename: "ProjectV2SingleSelectField", id: "F_PRIORITY", name: "Priority", dataType: "SINGLE_SELECT", options: [{ id: "O_P1", name: "P1" }] },
            { __typename: "ProjectV2Field", id: "F_EST", name: "Estimate", dataType: "NUMBER" },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        items: {
          nodes: present ? [{
            id: "ITEM_27",
            content: { __typename: "Issue", number: 27, repository: { nameWithOwner: "nomed/yukh" } },
            fieldValues: {
              nodes: [
                { __typename: "ProjectV2ItemFieldTextValue", text: "platform", field: { name: "Area" } },
                { __typename: "ProjectV2ItemFieldNumberValue", number: 3, field: { name: "Estimate" } },
                { __typename: "ProjectV2ItemFieldSingleSelectValue", name: "P1", field: { name: "Priority" } },
                { __typename: "ProjectV2ItemFieldSingleSelectValue", name: "Feature", field: { name: "Type" } },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          }] : [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
    user: null,
  };
}

class RoutedTransport implements GraphqlTransport {
  readonly calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  private mutationIndex = 0;
  constructor(private readonly present = false, private readonly failMutationAt?: number) {}

  async execute<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    this.calls.push({ query, variables });
    if (query.includes("ResolveIssue")) return issueResponse as T;
    if (query.includes("DiscoverProject")) return projectResponse(this.present) as T;
    this.mutationIndex += 1;
    if (this.failMutationAt === this.mutationIndex) throw new Error("gateway timeout");
    if (query.includes("AddProjectItem")) return { addProjectV2ItemById: { item: { id: "ITEM_27" } } } as T;
    return { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM_27" } } } as T;
  }
}

const baseInput = {
  repository: "nomed/yukh",
  issueNumber: 27,
  projectNumber: 1,
  policySource,
  token: "token",
};

describe("GitHubGraphqlTransport", () => {
  it("sends an authenticated GraphQL request and returns data", async () => {
    const fetcher: FetchLike = async (_url, init) => {
      expect(init.headers.authorization).toBe("Bearer secret");
      expect(JSON.parse(init.body)).toMatchObject({ variables: { value: 1 } });
      return { ok: true, status: 200, json: async () => ({ data: { ok: true } }) };
    };
    await expect(new GitHubGraphqlTransport("secret", fetcher).execute("query X", { value: 1 })).resolves.toEqual({ ok: true });
  });

  it("surfaces GraphQL errors", async () => {
    const fetcher: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ errors: [{ message: "Resource not accessible" }] }) });
    await expect(new GitHubGraphqlTransport("secret", fetcher).execute("query X", {})).rejects.toThrow("Resource not accessible");
  });
});

describe("connected runtime", () => {
  it("performs discovery and planning without writes in dry-run", async () => {
    const transport = new RoutedTransport(false);
    const result = await runConnectedActionRuntime({ ...baseInput, mode: "dry-run" }, transport);
    expect(result).toMatchObject({ ok: true, mode: "dry-run", applied: 0, remaining: 5, writes: 0 });
    expect(transport.calls.filter(({ query }) => query.includes("mutation"))).toHaveLength(0);
    expect(result.summary).toContain("**Status:** dry-run");
  });

  it("applies a missing item and all drifted fields", async () => {
    const transport = new RoutedTransport(false);
    const result = await runConnectedActionRuntime({ ...baseInput, mode: "apply", applyEnabled: true }, transport);
    expect(result).toMatchObject({ ok: true, applied: 5, remaining: 0, retryable: false, writes: 5 });
    expect(transport.calls.filter(({ query }) => query.includes("mutation"))).toHaveLength(5);
    expect(result.summary).toContain("**Status:** success");
  });

  it("performs no writes when repeated state already matches", async () => {
    const transport = new RoutedTransport(true);
    const result = await runConnectedActionRuntime({ ...baseInput, mode: "apply", applyEnabled: true }, transport);
    expect(result).toMatchObject({ ok: true, applied: 0, remaining: 0, writes: 0 });
    expect(transport.calls.filter(({ query }) => query.includes("mutation"))).toHaveLength(0);
    expect(result.summary).toContain("No drift detected.");
  });

  it("fails closed when apply is not explicitly enabled", async () => {
    const transport = new RoutedTransport(false);
    const result = await runConnectedActionRuntime({ ...baseInput, mode: "apply" }, transport);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "apply_not_enabled" }], writes: 0 });
    expect(transport.calls).toHaveLength(0);
  });

  it("returns retryable partial failure details", async () => {
    const transport = new RoutedTransport(false, 3);
    const result = await runConnectedActionRuntime({ ...baseInput, mode: "apply", applyEnabled: true }, transport);
    expect(result).toMatchObject({ ok: false, applied: 2, remaining: 3, retryable: true, writes: 2 });
    expect(result.diagnostics[0]?.code).toBe("project_mutation_failed");
    expect(result.summary).toContain("**Remaining operations:** 3");
  });

  it("normalizes lookup permission failures", async () => {
    const transport: GraphqlTransport = { execute: async () => { throw new Error("Resource not accessible by integration"); } };
    const result = await runConnectedActionRuntime({ ...baseInput, mode: "dry-run" }, transport);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "github_permission_denied", path: "issue" }], retryable: true });
  });
});
