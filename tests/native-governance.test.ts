import { describe, expect, it } from "vitest";
import {
  applyNativeGovernance,
  GitHubRestNativeGovernanceAdapter,
  planNativeGovernance,
  type NativeGovernanceOperation,
  type RestFetchLike,
} from "../src/native-governance.js";

describe("native governance planning", () => {
  it("plans milestone, parent replacement, and dependency reconciliation deterministically", () => {
    const result = planNativeGovernance(
      { milestone: "R0", parent: 155, dependsOn: [110, 164] },
      {
        issueDatabaseId: 900,
        observed: { milestone: "OLD", parent: 99, dependsOn: [109, 110] },
        milestoneNumbers: { R0: 7 },
        parentDatabaseIds: { 99: 999, 155: 1155 },
        dependencyDatabaseIds: { 109: 1009, 110: 1010, 164: 1064 },
      },
    );
    expect(result).toEqual({ ok: true, plan: { operations: [
      { kind: "set_milestone", milestoneNumber: 7, milestoneTitle: "R0" },
      { kind: "remove_parent", parentNumber: 99, issueDatabaseId: 900 },
      { kind: "set_parent", parentNumber: 155, issueDatabaseId: 900 },
      { kind: "add_dependency", dependencyNumber: 164, dependencyDatabaseId: 1064 },
      { kind: "remove_dependency", dependencyNumber: 109, dependencyDatabaseId: 1009 },
    ] } });
  });

  it("fails closed when declared native targets do not exist", () => {
    const result = planNativeGovernance(
      { milestone: "R0", parent: 155, dependsOn: [164] },
      { issueDatabaseId: 900, observed: { dependsOn: [] }, milestoneNumbers: {}, parentDatabaseIds: {}, dependencyDatabaseIds: {} },
    );
    expect(result).toMatchObject({ ok: false, diagnostics: [
      { code: "native_milestone_not_found", path: "milestone" },
      { code: "native_parent_not_found", path: "relationships.parent" },
      { code: "native_dependency_not_found", path: "relationships.dependsOn.164" },
    ] });
  });
});

describe("GitHub REST native governance adapter", () => {
  it("discovers and applies official milestone, sub-issue, and dependency endpoints", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const fetcher: RestFetchLike = async (url, init) => {
      calls.push({ url, method: init.method, ...(init.body ? { body: JSON.parse(init.body) } : {}) });
      if (url.endsWith("/issues/27")) return response(200, { id: 927, number: 27, milestone: null });
      if (url.endsWith("/issues/27/parent")) return response(200, { id: 901, number: 1 });
      if (url.includes("/dependencies/blocked_by?")) return response(200, [{ id: 903, number: 3 }]);
      if (url.endsWith("/issues/2")) return response(200, { id: 902, number: 2 });
      if (url.endsWith("/issues/4")) return response(200, { id: 904, number: 4 });
      if (url.includes("/milestones?")) return response(200, [{ number: 7, title: "R0" }]);
      return response(200, {});
    };
    const adapter = new GitHubRestNativeGovernanceAdapter("token", fetcher);
    const discovered = await adapter.discover({ repository: "nomed/yukh", issueNumber: 27, desired: { milestone: "R0", parent: 2, dependsOn: [3, 4] } });
    expect(discovered).toEqual({
      issueDatabaseId: 927,
      observed: { parent: 1, dependsOn: [3] },
      milestoneNumbers: { R0: 7 },
      parentDatabaseIds: { 1: 901, 2: 902 },
      dependencyDatabaseIds: { 3: 903, 4: 904 },
    });
    const planned = planNativeGovernance({ milestone: "R0", parent: 2, dependsOn: [3, 4] }, discovered);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const applied = await applyNativeGovernance({ repository: "nomed/yukh", issueNumber: 27, operations: planned.plan.operations, adapter });
    expect(applied).toMatchObject({ ok: true, applied: 4, remaining: [] });
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: expect.stringMatching(/\/issues\/2$/), method: "GET" }),
      expect.objectContaining({ url: expect.stringMatching(/\/issues\/4$/), method: "GET" }),
      expect.objectContaining({ url: expect.stringMatching(/\/issues\/27$/), method: "PATCH", body: { milestone: 7 } }),
      expect.objectContaining({ url: expect.stringMatching(/\/issues\/1\/sub_issue$/), method: "DELETE", body: { sub_issue_id: 927 } }),
      expect.objectContaining({ url: expect.stringMatching(/\/issues\/2\/sub_issues$/), method: "POST", body: { sub_issue_id: 927, replace_parent: true } }),
      expect.objectContaining({ url: expect.stringMatching(/\/issues\/27\/dependencies\/blocked_by$/), method: "POST", body: { issue_id: 904 } }),
    ]));
  });

  it("keeps missing declared parent and dependencies as planned validation errors", async () => {
    const fetcher: RestFetchLike = async (url) => {
      if (url.endsWith("/issues/27")) return response(200, { id: 927, number: 27, milestone: null });
      if (url.endsWith("/issues/27/parent")) return response(404, { message: "Not Found" });
      if (url.includes("/dependencies/blocked_by?")) return response(200, []);
      if (url.endsWith("/issues/2")) return response(404, { message: "Not Found" });
      if (url.endsWith("/issues/4")) return response(404, { message: "Not Found" });
      return response(200, {});
    };
    const adapter = new GitHubRestNativeGovernanceAdapter("token", fetcher);
    const discovered = await adapter.discover({ repository: "nomed/yukh", issueNumber: 27, desired: { parent: 2, dependsOn: [4] } });
    expect(planNativeGovernance({ parent: 2, dependsOn: [4] }, discovered)).toMatchObject({
      ok: false,
      diagnostics: [
        { code: "native_parent_not_found", path: "relationships.parent" },
        { code: "native_dependency_not_found", path: "relationships.dependsOn.4" },
      ],
    });
  });

  it("returns remaining native work on a partial failure", async () => {
    const operations: NativeGovernanceOperation[] = [
      { kind: "set_parent", parentNumber: 1, issueDatabaseId: 9 },
      { kind: "add_dependency", dependencyNumber: 2, dependencyDatabaseId: 10 },
    ];
    let calls = 0;
    const result = await applyNativeGovernance({
      repository: "nomed/yukh",
      issueNumber: 9,
      operations,
      adapter: {
        discover: async () => { throw new Error("unused"); },
        apply: async () => { calls += 1; if (calls === 2) throw new Error("HTTP 503"); },
      },
    });
    expect(result).toMatchObject({ ok: false, applied: 1, remaining: [operations[1]], diagnostics: [{ code: "native_governance_mutation_failed" }] });
  });
});

function response(status: number, payload: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}
