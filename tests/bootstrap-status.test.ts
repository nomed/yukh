import { describe, expect, it } from "vitest";
import { desiredProjectSchema, mergeBootstrapOptions, planProjectBootstrap, runProjectBootstrap, type ExistingBootstrapField } from "../src/bootstrap.js";
import { loadProjectPolicy } from "../src/policy.js";
import type { GraphqlTransport } from "../src/project.js";

const policySource = `version: 1
project: { owner: nomed, repository: example, name: Example }
contract: { marker: yukh, schema: 1 }
fields:
  kind: { project_field: Type, required: true, values: { feature: Feature, task: Task } }
  area: { project_field: Area, required: true, values: { contract: Contract, storage: Storage } }
  priority: { project_field: Priority, required: true, values: { P0: Critical, P1: High } }
  component: { project_field: Component, ownership: extension, required: true, values: { edge: Edge, hub: Hub, shared: Shared } }
  estimate: { project_field: Estimate, type: number }
  status: { project_field: Status, derived: true }
workflow:
  backlog_status: Backlog
  ready_status: Ready
  in_progress_status: In Progress
  review_status: Review
  blocked_status: Blocked
  done_status: Done
defaults: { execution: hybrid }
scheduling: { automatic_iteration: false }
safety: { overwrite_human_values: false, fail_on_unknown_values: true, comment_on_validation_error: true }
`;
const opt = (id: string, name: string) => ({ id, name, color: "GRAY", description: "" });
const statuses = ["Backlog", "Ready", "In Progress", "Review", "Blocked", "Done"];

describe("Project bootstrap planner", () => {
  it("derives canonical Status options", () => {
    const policy = loadProjectPolicy(policySource);
    expect(policy.ok).toBe(true);
    if (!policy.ok) return;
    const desired = desiredProjectSchema(policy.value);
    expect(desired.fields.map(({ name }) => name)).toEqual(["Area", "Component", "Estimate", "Priority", "Status", "Type"]);
    expect(desired.fields.find(({ name }) => name === "Component")?.options.map(({ name }) => name)).toEqual(["Edge", "Hub", "Shared"]);
    expect(desired.fields.find(({ name }) => name === "Status")?.options.map(({ name }) => name)).toEqual(statuses);
  });

  it("uses canonical workflow defaults", () => {
    const policy = loadProjectPolicy(policySource.replace(/workflow:[\s\S]*?defaults:/, "defaults:"));
    expect(policy.ok).toBe(true);
    if (policy.ok) expect(Object.values(policy.value.workflow)).toEqual(statuses);
  });

  it("preserves unrelated options", () => {
    const merged = mergeBootstrapOptions([opt("1", "Ready"), opt("2", "Triage")], [opt("", "Ready"), opt("", "Blocked")]);
    expect(merged.missing).toEqual(["Blocked"]);
    expect(merged.preserved).toEqual(["Triage"]);
  });

  it("fails atomically for unmanaged Status", () => {
    const existing: ExistingBootstrapField[] = [{ id: "S", name: "Status", dataType: "SINGLE_SELECT", mutability: "derived", options: [] }];
    const planned = planProjectBootstrap(existing, [
      { name: "Area", dataType: "SINGLE_SELECT", options: [opt("", "Runtime")] },
      { name: "Status", dataType: "SINGLE_SELECT", management: "status", options: [opt("", "Blocked")] },
    ]);
    expect(planned.ok).toBe(false);
    expect(planned.plan.operations).toEqual([]);
    expect(planned.diagnostics[0]?.code).toBe("unsupported_status_field");
  });
});

class Transport implements GraphqlTransport {
  readonly calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  constructor(private readonly converged = false) {}
  async execute<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    this.calls.push({ query, variables });
    if (!query.includes("BootstrapProject")) return {} as T;
    const statusNames = this.converged ? [...statuses, "Triage"] : ["Backlog", "Ready", "In Progress", "Review", "Done", "Triage"];
    const custom = (id: string, name: string, dataType: string, options: ReturnType<typeof opt>[] = []) => ({ __typename: dataType === "SINGLE_SELECT" ? "ProjectV2SingleSelectField" : "ProjectV2Field", id, name, dataType, databaseId: 1, options });
    return { repositoryOwner: { projectV2: { id: "P", title: "Example", fields: { nodes: this.converged ? [
      custom("E", "Estimate", "NUMBER"),
      { __typename: "ProjectV2SingleSelectField", id: "S", name: "Status", dataType: "SINGLE_SELECT", databaseId: null, options: statusNames.map((name) => opt(name, name)) },
      custom("A", "Area", "SINGLE_SELECT", [opt("c", "Contract"), opt("s", "Storage")]),
      custom("C", "Component", "SINGLE_SELECT", [opt("e", "Edge"), opt("h", "Hub"), opt("s", "Shared")]),
      custom("P", "Priority", "SINGLE_SELECT", [opt("0", "Critical"), opt("1", "High")]),
      custom("T", "Type", "SINGLE_SELECT", [opt("f", "Feature"), opt("t", "Task")]),
    ] : [
      { __typename: "ProjectV2SingleSelectField", id: "S", name: "Status", dataType: "SINGLE_SELECT", databaseId: null, options: statusNames.map((name) => opt(name, name)) },
      custom("P", "Priority", "SINGLE_SELECT", [opt("0", "Critical")]),
    ] } } } } as T;
  }
}

describe("Project bootstrap runtime", () => {
  it("dry-run includes missing Status without writes", async () => {
    const transport = new Transport();
    const result = await runProjectBootstrap({ policySource, projectNumber: 3, mode: "dry-run", tokenAvailable: true }, transport);
    expect(result.ok).toBe(true);
    expect(result.plan.operations.find(({ field }) => field.name === "Status")).toMatchObject({ kind: "update-options", missing: ["Blocked"], preserved: ["Triage"] });
    expect(transport.calls.filter(({ query }) => query.includes("mutation"))).toHaveLength(0);
  });

  it("apply and second apply are idempotent", async () => {
    const first = await runProjectBootstrap({ policySource, projectNumber: 3, mode: "apply", applyEnabled: true, tokenAvailable: true }, new Transport());
    expect(first.ok).toBe(true);
    expect(first.applied).toBe(6);
    const second = await runProjectBootstrap({ policySource, projectNumber: 3, mode: "apply", applyEnabled: true, tokenAvailable: true }, new Transport(true));
    expect(second.ok).toBe(true);
    expect(second.applied).toBe(0);
    expect(second.plan.operations).toEqual([]);
  });
});
