import { describe, expect, it } from "vitest";
import { parseIssueContract } from "../src/contract.js";

const validBody = `Human-readable issue body.

<!-- yukh
schema: 1
kind: gate
area: governance
priority: P0
milestone: M0
parent: 55
children: [61, 60, 61]
depends_on: [59, 57]
blocks: [47, 46]
size: S
estimate: 2
iteration: auto
execution: human
owner: nomed
x-source: uc-rust
-->

## Objective
Approve the knowledge foundation.`;

describe("parseIssueContract", () => {
  it("parses and normalizes a valid contract deterministically", () => {
    const result = parseIssueContract(validBody, {
      issueNumber: 62,
      artifact: "nomed/uc-rust#62",
    });

    expect(result).toEqual({
      ok: true,
      contract: {
        schema: 1,
        kind: "gate",
        area: "governance",
        priority: "P0",
        milestone: "M0",
        parent: 55,
        children: [60, 61],
        dependsOn: [57, 59],
        blocks: [46, 47],
        size: "S",
        estimate: 2,
        iteration: "auto",
        execution: "human",
        owner: "nomed",
        extensions: { "x-source": "uc-rust" },
      },
    });
  });

  it("reports a missing contract", () => {
    const result = parseIssueContract("ordinary issue body");
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: "missing_contract",
          message: "issue does not contain a Yukh contract",
          path: "$",
        },
      ],
    });
  });

  it("rejects duplicate contracts", () => {
    const block = "<!-- yukh\nschema: 1\nkind: task\narea: core\npriority: P1\n-->";
    const result = parseIssueContract(`${block}\n${block}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe("duplicate_contract");
  });

  it("rejects malformed YAML", () => {
    const result = parseIssueContract(`<!-- yukh
schema: 1
kind: [broken
area: core
priority: P1
-->`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe("malformed_yaml");
  });

  it("rejects unsupported schema versions", () => {
    const result = parseIssueContract(`<!-- yukh
schema: 2
kind: task
area: core
priority: P1
-->`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toContainEqual({
        code: "unsupported_schema",
        message: "schema must be exactly 1",
        path: "schema",
      });
    }
  });

  it("reports all missing required fields", () => {
    const result = parseIssueContract("<!-- yukh\nschema: 1\n-->");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.filter((d) => d.code === "missing_required")).toHaveLength(3);
    }
  });

  it("rejects unknown keys but preserves x- extensions", () => {
    const result = parseIssueContract(`<!-- yukh
schema: 1
kind: task
area: core
priority: P1
surprise: true
x-note: accepted
-->`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics).toContainEqual({
        code: "unknown_key",
        message: "unknown contract key: surprise",
        path: "surprise",
      });
    }
  });

  it("rejects invalid execution values", () => {
    const result = parseIssueContract(`<!-- yukh
schema: 1
kind: task
area: core
priority: P1
execution: robot
-->`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.path).toBe("execution");
  });

  it("rejects non-positive issue references", () => {
    const result = parseIssueContract(`<!-- yukh
schema: 1
kind: task
area: core
priority: P1
depends_on: [0, -2, 3]
-->`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map((d) => d.path)).toEqual([
        "depends_on[0]",
        "depends_on[1]",
      ]);
    }
  });

  it("rejects self references with actionable paths", () => {
    const result = parseIssueContract(`<!-- yukh
schema: 1
kind: task
area: core
priority: P1
parent: 42
blocks: [42]
-->`, { issueNumber: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.filter((d) => d.code === "self_reference")).toEqual([
        {
          code: "self_reference",
          message: "parent must not reference issue #42",
          path: "parent",
        },
        {
          code: "self_reference",
          message: "blocks must not reference issue #42",
          path: "blocks",
        },
      ]);
    }
  });

  it("parses governed extensions deterministically and rejects malformed namespaces", () => {
    const valid = parseIssueContract(`<!-- yukh
schema: 1
kind: task
area: core
priority: P1
extensions:
  component: edge
-->`);
    expect(valid).toMatchObject({ ok: true, contract: { extensions: { component: "edge" } } });

    for (const source of ["extensions: edge", "extensions: [edge]"]) {
      const result = parseIssueContract(`<!-- yukh
schema: 1
kind: task
area: core
priority: P1
${source}
-->`);
      expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "invalid_type", path: "extensions" }] });
    }
  });

  it("rejects reserved and malformed extension names", () => {
    const result = parseIssueContract(`<!-- yukh
schema: 1
kind: task
area: core
priority: P1
extensions:
  parent: edge
  Bad-Name: hub
-->`);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.diagnostics.map(({ code }) => code).sort()).toEqual([
      "invalid_extension_name",
      "reserved_extension_name",
    ]);
  });

  it("rejects an unterminated contract", () => {
    const result = parseIssueContract("<!-- yukh\nschema: 1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe("unterminated_contract");
  });
});
