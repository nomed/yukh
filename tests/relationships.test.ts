import { describe, expect, it } from "vitest";
import {
  buildRelationshipPlan,
  normalizeRelationships,
  type RelationshipGraph,
} from "../src/relationships.js";

const graph = (nodes: RelationshipGraph["nodes"]): RelationshipGraph => ({ nodes });

describe("normalizeRelationships", () => {
  it("deduplicates and sorts relationship lists", () => {
    expect(
      normalizeRelationships({
        children: [4, 2, 4],
        dependsOn: [9, 7, 9],
        blocks: [12, 10, 12],
      }),
    ).toEqual({
      children: [2, 4],
      dependsOn: [7, 9],
      blocks: [10, 12],
    });
  });
});

describe("buildRelationshipPlan", () => {
  it("produces a deterministic no-op plan", () => {
    const desired = {
      parent: 1,
      children: [3],
      dependsOn: [4],
      blocks: [5],
    };
    const result = buildRelationshipPlan({
      issueNumber: 2,
      desired,
      observed: desired,
      graph: graph([
        { issueNumber: 1, desired: { children: [2] } },
        { issueNumber: 3, desired: { parent: 2 } },
        { issueNumber: 4, desired: { blocks: [2] } },
        { issueNumber: 5, desired: { dependsOn: [2] } },
      ]),
    });
    expect(result).toMatchObject({ ok: true, plan: { operations: [] } });
  });

  it("plans deterministic creation and removal operations", () => {
    const result = buildRelationshipPlan({
      issueNumber: 2,
      desired: { parent: 1, children: [3], dependsOn: [4], blocks: [5] },
      observed: { parent: 6, children: [7], dependsOn: [8], blocks: [9] },
      graph: graph([
        { issueNumber: 1, desired: { children: [2] } },
        { issueNumber: 3, desired: { parent: 2 } },
        { issueNumber: 4, desired: { blocks: [2] } },
        { issueNumber: 5, desired: { dependsOn: [2] } },
        { issueNumber: 6, desired: {} },
        { issueNumber: 7, desired: {} },
        { issueNumber: 8, desired: {} },
        { issueNumber: 9, desired: {} },
      ]),
    });
    expect(result).toEqual({
      ok: true,
      plan: {
        issueNumber: 2,
        desired: { parent: 1, children: [3], dependsOn: [4], blocks: [5] },
        observed: { parent: 6, children: [7], dependsOn: [8], blocks: [9] },
        operations: [
          { action: "add", relationship: "blocks", issueNumber: 5 },
          { action: "remove", relationship: "blocks", issueNumber: 9 },
          { action: "add", relationship: "child", issueNumber: 3 },
          { action: "remove", relationship: "child", issueNumber: 7 },
          { action: "add", relationship: "depends_on", issueNumber: 4 },
          { action: "remove", relationship: "depends_on", issueNumber: 8 },
          { action: "add", relationship: "parent", issueNumber: 1 },
          { action: "remove", relationship: "parent", issueNumber: 6 },
        ],
      },
    });
  });

  it("rejects missing references", () => {
    const result = buildRelationshipPlan({
      issueNumber: 2,
      desired: { dependsOn: [99] },
      graph: graph([]),
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "relationship_missing_reference",
          path: "relationships.dependsOn",
        },
      ],
    });
  });

  it("rejects self references", () => {
    const result = buildRelationshipPlan({
      issueNumber: 2,
      desired: { parent: 2, children: [2], dependsOn: [2], blocks: [2] },
      graph: graph([]),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.filter(({ code }) => code === "relationship_self_reference")).toHaveLength(4);
  });

  it("detects ambiguous parent declarations", () => {
    const result = buildRelationshipPlan({
      issueNumber: 2,
      desired: {},
      graph: graph([
        { issueNumber: 1, desired: { children: [3] } },
        { issueNumber: 3, desired: { parent: 1 } },
        { issueNumber: 4, desired: { children: [3] } },
      ]),
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        {
          code: "relationship_ambiguous_parent",
          path: "issues.3.relationships.parent",
        },
      ]),
    });
  });

  it("detects reciprocal conflicts", () => {
    const result = buildRelationshipPlan({
      issueNumber: 2,
      desired: { dependsOn: [3] },
      graph: graph([{ issueNumber: 3, desired: {} }]),
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "relationship_reciprocal_conflict",
          path: "issues.2.relationships.dependsOn",
        },
      ],
    });
  });

  it("detects dependency cycles", () => {
    const result = buildRelationshipPlan({
      issueNumber: 1,
      desired: { dependsOn: [2], blocks: [3] },
      graph: graph([
        { issueNumber: 2, desired: { dependsOn: [3], blocks: [1] } },
        { issueNumber: 3, desired: { dependsOn: [1], blocks: [2] } },
      ]),
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        {
          code: "relationship_dependency_cycle",
          path: "relationships.dependsOn",
        },
      ]),
    });
  });

  it("detects parent cycles", () => {
    const result = buildRelationshipPlan({
      issueNumber: 1,
      desired: { parent: 2, children: [3] },
      graph: graph([
        { issueNumber: 2, desired: { parent: 3, children: [1] } },
        { issueNumber: 3, desired: { parent: 1, children: [2] } },
      ]),
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        {
          code: "relationship_parent_cycle",
          path: "relationships.parent",
        },
      ]),
    });
  });

  it("rejects duplicate graph nodes", () => {
    const result = buildRelationshipPlan({
      issueNumber: 1,
      desired: {},
      graph: graph([
        { issueNumber: 2, desired: {} },
        { issueNumber: 2, desired: {} },
      ]),
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "duplicate_relationship_issue",
          path: "issues.2",
        },
      ],
    });
  });
});
