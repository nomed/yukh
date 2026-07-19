import { describe, expect, it } from "vitest";
import { planProjectBootstrap, runProjectBootstrap, type ExistingBootstrapField } from "../src/bootstrap.js";
import type { GraphqlTransport } from "../src/project.js";

const desired = [
  { name: "Area", dataType: "SINGLE_SELECT" as const, options: [{ name: "Runtime", color: "GRAY", description: "" }] },
  { name: "Priority", dataType: "SINGLE_SELECT" as const, options: [{ name: "P0", color: "GRAY", description: "" }] },
  { name: "Work Type", dataType: "SINGLE_SELECT" as const, options: [{ name: "Feature", color: "GRAY", description: "" }] },
];

const policySource = `version: 1
project: { owner: retex-iconic, repository: rgk, name: rgk }
contract: { marker: yukh, schema: 1 }
fields:
  area:
    project_field: Area
    values: { runtime: Runtime }
  priority:
    project_field: Priority
    values: { P0: P0 }
  kind:
    project_field: Work Type
    values: { feature: Feature }
defaults: { execution: hybrid }
scheduling: { automatic_iteration: false }
safety:
  overwrite_human_values: false
  fail_on_unknown_values: true
  comment_on_validation_error: true
`;

describe("non-custom Project field preflight", () => {
  it("invalidates the complete plan before mutations", () => {
    const existing: ExistingBootstrapField[] = [{
      id: "PVTSSF_DERIVED",
      name: "Priority",
      dataType: "SINGLE_SELECT",
      options: [],
      typename: "ProjectV2SingleSelectField",
      mutability: "derived",
    }];
    const result = planProjectBootstrap(existing, desired);
    expect(result.ok).toBe(false);
    expect(result.plan.operations).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe("non_custom_project_field");
  });

  it("performs zero writes for the reproduced RGK partial state", async () => {
    class Transport implements GraphqlTransport {
      calls: string[] = [];
      async execute<T>(query: string): Promise<T> {
        this.calls.push(query);
        if (query.includes("BootstrapProject")) {
          return { repositoryOwner: { projectV2: { id: "PVT_15", title: "rgk", fields: { nodes: [
            { __typename: "ProjectV2SingleSelectField", databaseId: 101, id: "F_AREA", name: "Area", dataType: "SINGLE_SELECT", options: [{ id: "O_RUNTIME", name: "Runtime", color: "GRAY", description: "" }] },
            { __typename: "ProjectV2SingleSelectField", databaseId: null, fullDatabaseId: null, id: "PVTSSF_DERIVED", name: "Priority", dataType: "SINGLE_SELECT", options: [] },
          ] } } } } as T;
        }
        throw new Error("mutation must not execute");
      }
    }
    const transport = new Transport();
    const result = await runProjectBootstrap({ policySource, projectNumber: 15, mode: "apply", applyEnabled: true, tokenAvailable: true }, transport);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(0);
    expect(result.plan.operations).toEqual([]);
    expect(result.remaining).toEqual([]);
    expect(result.diagnostics.some(({ code }) => code === "non_custom_project_field")).toBe(true);
    expect(transport.calls.filter((query) => query.includes("mutation"))).toEqual([]);
  });
});
