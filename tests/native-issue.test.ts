import { describe, expect, it } from "vitest";
import { planNativeIssueMutations, SafeNativeIssueMutationAdapter } from "../src/native-issue.js";
import type { GraphqlTransport } from "../src/project.js";

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

const input = {
  issueId: "ISSUE_1",
  desiredIssueType: "Feature",
  observedIssueType: "Task",
  issueTypes: [{ id: "TYPE_FEATURE", name: "Feature" }],
  desiredIssueFields: { Priority: "High" },
  observedIssueFields: { Priority: "Low" },
  issueFields: [{
    id: "FIELD_PRIORITY",
    name: "Priority",
    dataType: "SINGLE_SELECT",
    options: [{ id: "OPTION_HIGH", name: "High" }],
  }],
};

describe("native issue mutation planning", () => {
  it("resolves every native identifier before returning operations", () => {
    expect(planNativeIssueMutations(input)).toEqual({
      ok: true,
      operations: [
        { kind: "set_issue_type", issueId: "ISSUE_1", issueTypeId: "TYPE_FEATURE", desiredValue: "Feature" },
        {
          kind: "set_issue_field",
          issueId: "ISSUE_1",
          fieldId: "FIELD_PRIORITY",
          fieldName: "Priority",
          value: { singleSelectOptionId: "OPTION_HIGH" },
          desiredValue: "High",
        },
      ],
    });
  });

  it("fails closed before writes when catalogs are incomplete", () => {
    const result = planNativeIssueMutations({ ...input, issueTypes: [], issueFields: [] });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "issue_type_not_found" }),
        expect.objectContaining({ code: "issue_field_not_found" }),
      ]),
    });
  });

  it("is idempotent when observed native values match", () => {
    expect(planNativeIssueMutations({
      ...input,
      observedIssueType: "Feature",
      observedIssueFields: { Priority: "High" },
    })).toEqual({ ok: true, operations: [] });
  });

  it("adds desired managed labels, removes stale managed labels, and preserves unrelated labels", () => {
    const result = planNativeIssueMutations({
      ...input,
      observedIssueType: "Feature",
      observedIssueFields: { Priority: "High" },
      desiredLabels: ["priority:P0", "type:feature"],
      managedLabels: ["priority:P0", "priority:P1", "type:feature"],
      observedLabels: ["keep", "priority:P1", "type:feature"],
      availableLabels: [
        { id: "LABEL_KEEP", name: "keep" },
        { id: "LABEL_P0", name: "priority:P0" },
        { id: "LABEL_P1", name: "priority:P1" },
        { id: "LABEL_TYPE", name: "type:feature" },
      ],
    });
    expect(result).toEqual({ ok: true, operations: [
      { kind: "add_issue_label", issueId: "ISSUE_1", labelId: "LABEL_P0", labelName: "priority:P0" },
      { kind: "remove_issue_label", issueId: "ISSUE_1", labelId: "LABEL_P1", labelName: "priority:P1" },
    ] });
  });

  it("fails closed when a declared desired label does not exist", () => {
    expect(planNativeIssueMutations({
      ...input,
      observedIssueType: "Feature",
      observedIssueFields: { Priority: "High" },
      desiredLabels: ["priority:P0"],
      managedLabels: ["priority:P0"],
      availableLabels: [],
    })).toMatchObject({ ok: false, diagnostics: [{ code: "issue_label_not_found", path: "native.labels.priority:P0" }] });
  });
});

describe("SafeNativeIssueMutationAdapter", () => {
  it("uses updateIssue for Type and setIssueFieldValue for Priority", async () => {
    const planned = planNativeIssueMutations(input);
    if (!planned.ok) throw new Error("plan should be valid");
    const transport = new SequenceTransport([
      { updateIssue: { issue: { id: "ISSUE_1" } } },
      { setIssueFieldValue: { issue: { id: "ISSUE_1" } } },
    ]);
    const result = await new SafeNativeIssueMutationAdapter(transport).apply(planned.operations);
    expect(result).toEqual({ ok: true, applied: 2, diagnostics: [] });
    expect(transport.calls[0]).toMatchObject({
      query: expect.stringContaining("updateIssue"),
      variables: { input: { id: "ISSUE_1", issueTypeId: "TYPE_FEATURE" } },
    });
    expect(transport.calls[1]).toMatchObject({
      query: expect.stringContaining("setIssueFieldValue"),
      variables: {
        input: {
          issueId: "ISSUE_1",
          issueFields: [{ fieldId: "FIELD_PRIORITY", singleSelectOptionId: "OPTION_HIGH" }],
        },
      },
    });
  });

  it("stops after a failed native mutation", async () => {
    const planned = planNativeIssueMutations(input);
    if (!planned.ok) throw new Error("plan should be valid");
    const result = await new SafeNativeIssueMutationAdapter(new SequenceTransport([new Error("denied")])).apply(planned.operations);
    expect(result).toMatchObject({ ok: false, applied: 0, diagnostics: [{ code: "native_issue_mutation_failed", path: "native.issueType" }] });
  });

  it("applies label additions and removals with native label mutations", async () => {
    const operations = [
      { kind: "add_issue_label" as const, issueId: "ISSUE_1", labelId: "LABEL_P0", labelName: "priority:P0" },
      { kind: "remove_issue_label" as const, issueId: "ISSUE_1", labelId: "LABEL_P1", labelName: "priority:P1" },
    ];
    const transport = new SequenceTransport([
      { addLabelsToLabelable: { labelable: { id: "ISSUE_1" } } },
      { removeLabelsFromLabelable: { labelable: { id: "ISSUE_1" } } },
    ]);
    expect(await new SafeNativeIssueMutationAdapter(transport).apply(operations)).toEqual({ ok: true, applied: 2, diagnostics: [] });
    expect(transport.calls[0]).toMatchObject({ query: expect.stringContaining("addLabelsToLabelable"), variables: { labelableId: "ISSUE_1", labelIds: ["LABEL_P0"] } });
    expect(transport.calls[1]).toMatchObject({ query: expect.stringContaining("removeLabelsFromLabelable"), variables: { labelableId: "ISSUE_1", labelIds: ["LABEL_P1"] } });
  });
});
