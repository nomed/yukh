import { describe, expect, it } from "vitest";
import {
  applyRelationshipPlan,
  reconcileRelationships,
  type RelationshipMutationAdapter,
} from "../src/relationship-application.js";
import type { RelationshipOperation, RelationshipPlan } from "../src/relationships.js";

class RecordingAdapter implements RelationshipMutationAdapter {
  readonly calls: Array<{ issueNumber: number; operation: RelationshipOperation }> = [];
  constructor(private readonly failAt?: number, private readonly error = new Error("gateway timeout")) {}

  async apply(issueNumber: number, operation: RelationshipOperation): Promise<void> {
    this.calls.push({ issueNumber, operation });
    if (this.failAt !== undefined && this.calls.length === this.failAt) throw this.error;
  }
}

const plan = (operations: RelationshipOperation[]): RelationshipPlan => ({
  issueNumber: 10,
  desired: { parent: 1, children: [2], dependsOn: [3], blocks: [4] },
  observed: { children: [], dependsOn: [], blocks: [] },
  operations,
});

describe("applyRelationshipPlan", () => {
  it("applies operations in deterministic plan order", async () => {
    const operations: RelationshipOperation[] = [
      { action: "add", relationship: "blocks", issueNumber: 4 },
      { action: "add", relationship: "child", issueNumber: 2 },
      { action: "add", relationship: "depends_on", issueNumber: 3 },
      { action: "add", relationship: "parent", issueNumber: 1 },
    ];
    const adapter = new RecordingAdapter();
    const result = await applyRelationshipPlan(plan(operations), adapter);

    expect(result).toEqual({
      ok: true,
      applied: operations.map((operation) => ({ issueNumber: 10, operation })),
      diagnostics: [],
      retryable: false,
      remaining: [],
    });
    expect(adapter.calls.map(({ operation }) => operation)).toEqual(operations);
  });

  it("performs no writes for a no-op plan", async () => {
    const adapter = new RecordingAdapter();
    const result = await applyRelationshipPlan(plan([]), adapter);
    expect(result).toMatchObject({ ok: true, applied: [], remaining: [] });
    expect(adapter.calls).toHaveLength(0);
  });

  it("preserves completed operations and returns retryable remaining work", async () => {
    const operations: RelationshipOperation[] = [
      { action: "remove", relationship: "parent", issueNumber: 9 },
      { action: "add", relationship: "parent", issueNumber: 1 },
      { action: "add", relationship: "child", issueNumber: 2 },
    ];
    const adapter = new RecordingAdapter(2);
    const result = await applyRelationshipPlan(plan(operations), adapter);

    expect(result).toEqual({
      ok: false,
      applied: [{ issueNumber: 10, operation: operations[0] }],
      diagnostics: [
        {
          code: "relationship_mutation_failed",
          message: "relationship mutation failed: gateway timeout",
          path: "relationships.parent.1",
        },
      ],
      retryable: true,
      remaining: operations.slice(1),
    });
  });

  it("normalizes unsupported and permission failures", async () => {
    const operation: RelationshipOperation = { action: "add", relationship: "blocks", issueNumber: 4 };
    const unsupported = await applyRelationshipPlan(
      plan([operation]),
      new RecordingAdapter(1, new Error("unsupported dependency API")),
    );
    expect(unsupported).toMatchObject({
      ok: false,
      diagnostics: [{ code: "unsupported_relationship_operation" }],
    });

    const denied = await applyRelationshipPlan(
      plan([operation]),
      new RecordingAdapter(1, new Error("Resource not accessible by integration")),
    );
    expect(denied).toMatchObject({
      ok: false,
      diagnostics: [{ code: "relationship_permission_denied" }],
    });
  });
});

describe("reconcileRelationships", () => {
  it("integrates planner and application end to end", async () => {
    const adapter = new RecordingAdapter();
    const result = await reconcileRelationships(
      {
        issueNumber: 2,
        desired: { parent: 1, children: [3], dependsOn: [4], blocks: [5] },
        observed: { children: [], dependsOn: [], blocks: [] },
        graph: {
          nodes: [
            { issueNumber: 1, desired: { children: [2] } },
            { issueNumber: 3, desired: { parent: 2 } },
            { issueNumber: 4, desired: { blocks: [2] } },
            { issueNumber: 5, desired: { dependsOn: [2] } },
          ],
        },
      },
      adapter,
    );

    expect(result).toMatchObject({ ok: true, applied: expect.any(Array) });
    expect(adapter.calls).toHaveLength(4);
  });

  it("does not call the adapter when validation fails", async () => {
    const adapter = new RecordingAdapter();
    const result = await reconcileRelationships(
      { issueNumber: 2, desired: { dependsOn: [99] }, graph: { nodes: [] } },
      adapter,
    );
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "relationship_missing_reference" }],
    });
    expect(adapter.calls).toHaveLength(0);
  });
});
