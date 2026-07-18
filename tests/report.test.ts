import { describe, expect, it } from "vitest";
import { buildReadOnlyReport, renderHumanReport, serializeReport } from "../src/report.js";

const ISSUE = `
<!-- yukh
schema: 1
kind: gate
area: governance
priority: P0
milestone: M0
parent: 55
depends_on: [60, 56, 57, 58, 59]
blocks: [54, 46, 47]
size: S
estimate: 2
iteration: auto
execution: human
-->

## Objective
Approve the architecture knowledge language.
`;

const POLICY = `
version: 1
project:
  owner: nomed
  repository: uc-rust
  name: uc-rust
contract:
  marker: yukh
  schema: 1
fields:
  kind:
    project_field: Work Type
    required: true
    values: { gate: Gate }
  area:
    project_field: Area
    required: true
    values: { governance: Governance }
  priority:
    project_field: Priority
    required: true
    values: { P0: P0 }
  size:
    project_field: Size
    values: { S: S }
  estimate:
    project_field: Estimate
    type: number
milestones: { M0: M0 }
defaults:
  execution: hybrid
scheduling:
  automatic_iteration: true
safety:
  overwrite_human_values: false
  fail_on_unknown_values: true
  comment_on_validation_error: true
`;

const MATCHING = {
  projectItemPresent: true,
  fields: {
    Area: "Governance",
    Estimate: 2,
    Priority: "P0",
    Size: "S",
    "Work Type": "Gate",
  },
  milestone: "M0",
  iteration: "auto",
  relationships: {
    parent: 55,
    children: [],
    dependsOn: [56, 57, 58, 59, 60],
    blocks: [46, 47, 54],
  },
};

describe("buildReadOnlyReport", () => {
  it("produces a deterministic no-op report", () => {
    const first = buildReadOnlyReport({ issueBody: ISSUE, policySource: POLICY, observed: MATCHING });
    const second = buildReadOnlyReport({ issueBody: ISSUE, policySource: POLICY, observed: MATCHING });
    expect(first).toEqual(second);
    expect(first.status).toBe("no-op");
    expect(first.differences).toEqual([]);
    expect(serializeReport(first)).toBe(serializeReport(second));
  });

  it("reports stable planned changes for drift", () => {
    const report = buildReadOnlyReport({
      issueBody: ISSUE,
      policySource: POLICY,
      observed: {
        ...MATCHING,
        projectItemPresent: false,
        fields: { ...MATCHING.fields, Priority: "P1" },
        relationships: { ...MATCHING.relationships, dependsOn: [56] },
      },
    });
    expect(report.status).toBe("changes");
    expect(report.differences.map(({ path }) => path)).toEqual([
      "fields.Priority",
      "projectItemPresent",
      "relationships.dependsOn",
    ]);
    expect(report.differences.every(({ kind }) => kind === "planned_change")).toBe(true);
  });

  it("warns without planning destructive changes for unmanaged fields", () => {
    const report = buildReadOnlyReport({
      issueBody: ISSUE,
      policySource: POLICY,
      observed: { ...MATCHING, fields: { ...MATCHING.fields, Notes: "keep me" } },
    });
    expect(report.status).toBe("warning");
    expect(report.differences).toMatchObject([
      { kind: "warning", action: "preserve_unmanaged_field", path: "fields.Notes" },
    ]);
  });

  it("returns actionable errors for invalid contracts", () => {
    const report = buildReadOnlyReport({ issueBody: "no contract", policySource: POLICY });
    expect(report.status).toBe("error");
    expect(report.contract).toBeNull();
    expect(report.diagnostics).toMatchObject([{ code: "missing_contract", path: "$" }]);
    expect(renderHumanReport(report)).toContain("ERROR $:");
  });

  it("returns policy diagnostics without producing desired state", () => {
    const report = buildReadOnlyReport({ issueBody: ISSUE, policySource: "version: [" });
    expect(report.status).toBe("error");
    expect(report.contract).not.toBeNull();
    expect(report.policy).toBeNull();
    expect(report.desired).toBeNull();
    expect(report.diagnostics[0]?.code).toBe("malformed_policy_yaml");
  });

  it("normalizes observed relationship order", () => {
    const report = buildReadOnlyReport({
      issueBody: ISSUE,
      policySource: POLICY,
      observed: {
        ...MATCHING,
        relationships: {
          ...MATCHING.relationships,
          blocks: [54, 46, 47, 46],
          dependsOn: [60, 56, 57, 58, 59],
        },
      },
    });
    expect(report.status).toBe("no-op");
    expect(report.observed.relationships.blocks).toEqual([46, 47, 54]);
  });

  it("renders concise human output", () => {
    const report = buildReadOnlyReport({ issueBody: ISSUE, policySource: POLICY, observed: MATCHING });
    expect(renderHumanReport(report)).toBe([
      "Yukh read-only reconciliation: no-op",
      "Mode: read-only",
      "Planned changes: 0",
      "Warnings: 0",
      "No drift detected.",
    ].join("\n"));
  });
});
