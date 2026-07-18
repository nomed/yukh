import { describe, expect, it } from "vitest";
import { buildStepSummary, runActionRuntime, validateRuntimeInput } from "../src/runtime.js";

const issueBody = `# Runtime\n\n<!-- yukh\nschema: 1\nkind: feature\narea: platform\npriority: P1\nsize: M\nestimate: 3\n-->`;

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
    values: { feature: Feature }
  area:
    project_field: Area
    required: true
    values: { platform: Platform }
  priority:
    project_field: Priority
    required: true
    values: { P1: P1 }
  size:
    project_field: Size
    required: false
    values: { M: M }
  estimate:
    project_field: Estimate
    required: false
    type: number
scheduling:
  automatic_iteration: false
safety:
  overwrite_human_values: false
  fail_on_unknown_values: true
  comment_on_validation_error: true
`;

const validInput = {
  repository: "nomed/yukh",
  issueNumber: 25,
  projectNumber: 1,
  mode: "dry-run",
  issueBody,
  policySource,
};

describe("GitHub Action runtime", () => {
  it("defaults safely to dry-run and validates repository context", () => {
    const { mode: _mode, ...withoutMode } = validInput;
    const result = validateRuntimeInput(withoutMode);
    expect(result).toMatchObject({ ok: true, value: { mode: "dry-run", repository: "nomed/yukh" } });
  });

  it("fails closed when apply is not explicitly enabled", () => {
    const result = validateRuntimeInput({ ...validInput, mode: "apply", tokenAvailable: true });
    expect(result).toMatchObject({ ok: false, mode: "apply", diagnostics: [{ code: "apply_not_enabled", path: "applyEnabled" }] });
  });

  it("requires a token for apply mode", () => {
    const result = validateRuntimeInput({ ...validInput, mode: "apply", applyEnabled: true, tokenAvailable: false });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "apply_token_missing", path: "token" }] });
  });

  it("produces deterministic read-only reports and summaries", () => {
    const first = runActionRuntime(validInput);
    const second = runActionRuntime(validInput);
    expect(first.ok, JSON.stringify(first)).toBe(true);
    expect(first.json).toBe(second.json);
    expect(first.summary).toBe(second.summary);
    expect(first.summary).toContain("**Issue:** nomed/yukh#25");
    expect(first.summary).toContain("**Planned changes:**");
  });

  it("renders actionable diagnostics for invalid input", () => {
    const result = runActionRuntime({ mode: "invalid" });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("invalid_runtime_mode");
    expect(result.summary).toContain("invalid_repository");
  });

  it("renders a no-drift summary", () => {
    const result = runActionRuntime({
      ...validInput,
      observed: {
        projectItemPresent: true,
        fields: { Area: "Platform", Estimate: 3, Priority: "P1", Size: "M", Type: "Feature" },
        relationships: { children: [], dependsOn: [], blocks: [] },
      },
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.report) throw new Error("report required");
    expect(buildStepSummary(result.report, "nomed/yukh", 25)).toContain("No drift detected.");
  });
});
