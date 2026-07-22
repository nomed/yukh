import { describe, expect, it } from "vitest";
import type { GraphqlTransport } from "../src/project.js";
import type { NativeGovernanceAdapter, NativeGovernanceOperation } from "../src/native-governance.js";
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
    target: issue_type
    required: true
    type: string
    derived: false
    values: { feature: Feature }
    labels: { feature: type:feature }
  area:
    project_field: Area
    required: true
    type: string
    derived: false
    values: {}
  priority:
    project_field: Priority
    target: issue_field
    required: true
    type: string
    derived: false
    values: { P1: P1 }
    labels: { P1: priority:P1 }
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

function issueResponse(aligned = false) {
  return {
    repository: {
      issue: {
        id: "ISSUE_27",
        number: 27,
        body: issueBody,
        issueType: aligned ? { id: "TYPE_FEATURE", name: "Feature" } : { id: "TYPE_TASK", name: "Task" },
        issueFieldValues: {
          nodes: aligned ? [{
            __typename: "IssueFieldSingleSelectValue",
            value: "P1",
            field: { id: "ISSUE_FIELD_PRIORITY", name: "Priority" },
          }] : [],
        },
        labels: { nodes: aligned ? [{ id: "LABEL_PRIORITY", name: "priority:P1" }, { id: "LABEL_TYPE", name: "type:feature" }] : [] },
      },
      labels: { nodes: [{ id: "LABEL_PRIORITY", name: "priority:P1" }, { id: "LABEL_TYPE", name: "type:feature" }, { id: "LABEL_KEEP", name: "keep" }] },
    },
    organization: {
      issueTypes: { nodes: [{ id: "TYPE_FEATURE", name: "Feature" }, { id: "TYPE_TASK", name: "Task" }] },
      issueFields: {
        nodes: [{
          __typename: "IssueFieldSingleSelect",
          id: "ISSUE_FIELD_PRIORITY",
          name: "Priority",
          dataType: "SINGLE_SELECT",
          options: [{ id: "ISSUE_OPTION_P1", name: "P1" }],
        }],
      },
    },
  };
}

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
    if (query.includes("ResolveIssue")) return issueResponse(this.present) as T;
    if (query.includes("DiscoverOrganizationProject") || query.includes("DiscoverUserProject")) {
      return projectResponse(this.present) as T;
    }
    this.mutationIndex += 1;
    if (this.failMutationAt === this.mutationIndex) throw new Error("gateway timeout");
    if (query.includes("AddProjectItem")) return { addProjectV2ItemById: { item: { id: "ITEM_27" } } } as T;
    if (query.includes("SetIssueType")) return { updateIssue: { issue: { id: "ISSUE_27" } } } as T;
    if (query.includes("SetIssueField")) return { setIssueFieldValue: { issue: { id: "ISSUE_27" } } } as T;
    if (query.includes("AddIssueLabel")) return { addLabelsToLabelable: { labelable: { id: "ISSUE_27" } } } as T;
    if (query.includes("RemoveIssueLabel")) return { removeLabelsFromLabelable: { labelable: { id: "ISSUE_27" } } } as T;
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
    expect(result).toMatchObject({ ok: true, mode: "dry-run", applied: 0, remaining: 7, writes: 0 });
    expect(transport.calls.filter(({ query }) => query.includes("mutation"))).toHaveLength(0);
    expect(result.summary).toContain("**Status:** dry-run");
    const issueQuery = transport.calls.find(({ query }) => query.includes("ResolveIssue"))?.query;
    expect(issueQuery).toContain("issueFieldValues(first: 100)");
    expect(issueQuery).toContain("field {\n              __typename\n              ... on IssueFieldSingleSelect { id name }");
    expect(issueQuery).not.toContain("field { id name }");
    expect(issueQuery).toContain("... on IssueFieldDate");
    expect(issueQuery).toContain("... on IssueFieldNumber");
    expect(issueQuery).toContain("... on IssueFieldSingleSelect");
    expect(issueQuery).toContain("... on IssueFieldText");
    expect(issueQuery).not.toContain("... on IssueFieldCommon");
    expect(issueQuery).toContain("value");
    expect(issueQuery).not.toContain("fieldValues(first: 100)");
    expect(issueQuery).not.toContain("... on IssueField {");
  });

  it("avoids organization issue metadata when policy uses Project fields and labels", async () => {
    const transport = new RoutedTransport(false);
    const repositoryPolicy = policySource
      .replace("    target: issue_type\n", "")
      .replace("    target: issue_field\n", "");
    const result = await runConnectedActionRuntime({ ...baseInput, policySource: repositoryPolicy, mode: "dry-run" }, transport);
    expect(result.ok).toBe(true);
    const query = transport.calls.find(({ query }) => query.includes("ResolveIssue"))?.query ?? "";
    expect(query).toContain("labels(first: 100)");
    expect(query).not.toContain("organization(login:");
    expect(query).not.toContain("issueType { id name }");
    expect(query).not.toContain("issueFieldValues(first: 100)");
  });

  it("applies a missing item and all drifted fields", async () => {
    const transport = new RoutedTransport(false);
    const result = await runConnectedActionRuntime({ ...baseInput, mode: "apply", applyEnabled: true }, transport);
    expect(result).toMatchObject({ ok: true, applied: 7, remaining: 0, retryable: false, writes: 7 });
    expect(transport.calls.filter(({ query }) => query.includes("mutation"))).toHaveLength(7);
    expect(result.summary).toContain("**Status:** success");
  });

  it("includes milestone, parent, and depends_on mutations in connected apply and idempotency counts", async () => {
    const transport = new RoutedTransport(false);
    const calls: NativeGovernanceOperation[] = [];
    const governance: NativeGovernanceAdapter = {
      discover: async () => ({
        issueDatabaseId: 927,
        observed: { dependsOn: [] },
        milestoneNumbers: { R0: 7 },
        dependencyDatabaseIds: { 2: 902 },
      }),
      apply: async ({ operation }) => { calls.push(operation); },
    };
    const body = issueBody.replace("estimate: 3", "estimate: 3\nmilestone: R0\nparent: 1\ndepends_on: [2]");
    const policy = policySource.replace("defaults:\n", "milestones: { R0: R0 }\ndefaults:\n");
    const result = await runConnectedActionRuntime(
      { ...baseInput, issueBody: body, policySource: policy, mode: "apply", applyEnabled: true },
      transport,
      governance,
    );
    expect(result).toMatchObject({ ok: true, applied: 10, remaining: 0, writes: 10 });
    expect(calls.map(({ kind }) => kind)).toEqual(["set_milestone", "set_parent", "add_dependency"]);
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
    expect(result).toMatchObject({ ok: false, applied: 2, remaining: 5, retryable: true, writes: 2 });
    expect(result.diagnostics[0]?.code).toBe("project_mutation_failed");
    expect(result.summary).toContain("**Remaining operations:** 5");
  });

  it("normalizes lookup permission failures", async () => {
    const transport: GraphqlTransport = { execute: async () => { throw new Error("Resource not accessible by integration"); } };
    const result = await runConnectedActionRuntime({ ...baseInput, mode: "dry-run" }, transport);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "github_permission_denied", path: "issue" }], retryable: true });
  });
});
