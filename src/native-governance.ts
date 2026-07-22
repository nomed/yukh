import type { ContractDiagnostic } from "./contract.js";

export interface NativeGovernanceState {
  milestone?: string;
  parent?: number;
  dependsOn: number[];
}

export type NativeGovernanceOperation =
  | { kind: "set_milestone"; milestoneNumber: number; milestoneTitle: string }
  | { kind: "remove_parent"; parentNumber: number; issueDatabaseId: number }
  | { kind: "set_parent"; parentNumber: number; issueDatabaseId: number }
  | { kind: "add_dependency"; dependencyNumber: number; dependencyDatabaseId: number }
  | { kind: "remove_dependency"; dependencyNumber: number; dependencyDatabaseId: number };

export interface NativeGovernanceDiscovery {
  issueDatabaseId: number;
  observed: NativeGovernanceState;
  milestoneNumbers: Record<string, number>;
  parentDatabaseIds: Record<number, number>;
  dependencyDatabaseIds: Record<number, number>;
}

export interface NativeGovernancePlan {
  operations: NativeGovernanceOperation[];
}

export type NativeGovernancePlanResult =
  | { ok: true; plan: NativeGovernancePlan }
  | { ok: false; diagnostics: ContractDiagnostic[] };

export interface NativeGovernanceAdapter {
  discover(input: {
    repository: string;
    issueNumber: number;
    desired: NativeGovernanceState;
  }): Promise<NativeGovernanceDiscovery>;
  apply(input: {
    repository: string;
    issueNumber: number;
    operation: NativeGovernanceOperation;
  }): Promise<void>;
}

function diagnostic(code: string, message: string, path: string): ContractDiagnostic {
  return { code, message, path };
}

function stable(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function planNativeGovernance(
  desired: NativeGovernanceState,
  discovered: NativeGovernanceDiscovery,
): NativeGovernancePlanResult {
  const diagnostics: ContractDiagnostic[] = [];
  const operations: NativeGovernanceOperation[] = [];
  if (desired.milestone !== undefined && desired.milestone !== discovered.observed.milestone) {
    const milestoneNumber = discovered.milestoneNumbers[desired.milestone];
    if (milestoneNumber === undefined) {
      diagnostics.push(diagnostic("native_milestone_not_found", `Milestone '${desired.milestone}' was not found`, "milestone"));
    } else operations.push({ kind: "set_milestone", milestoneNumber, milestoneTitle: desired.milestone });
  }

  if (desired.parent !== discovered.observed.parent) {
    if (discovered.observed.parent !== undefined) {
      operations.push({ kind: "remove_parent", parentNumber: discovered.observed.parent, issueDatabaseId: discovered.issueDatabaseId });
    }
    if (desired.parent !== undefined) {
      if (discovered.parentDatabaseIds[desired.parent] === undefined) {
        diagnostics.push(diagnostic("native_parent_not_found", `Parent issue #${desired.parent} was not found`, "relationships.parent"));
      } else operations.push({ kind: "set_parent", parentNumber: desired.parent, issueDatabaseId: discovered.issueDatabaseId });
    }
  }

  const wanted = new Set(stable(desired.dependsOn));
  const observed = new Set(stable(discovered.observed.dependsOn));
  for (const dependencyNumber of [...wanted].sort((a, b) => a - b)) {
    if (observed.has(dependencyNumber)) continue;
    const dependencyDatabaseId = discovered.dependencyDatabaseIds[dependencyNumber];
    if (dependencyDatabaseId === undefined) {
      diagnostics.push(diagnostic("native_dependency_not_found", `Dependency issue #${dependencyNumber} was not found`, `relationships.dependsOn.${dependencyNumber}`));
    } else operations.push({ kind: "add_dependency", dependencyNumber, dependencyDatabaseId });
  }
  for (const dependencyNumber of [...observed].sort((a, b) => a - b)) {
    if (wanted.has(dependencyNumber)) continue;
    const dependencyDatabaseId = discovered.dependencyDatabaseIds[dependencyNumber];
    if (dependencyDatabaseId === undefined) {
      diagnostics.push(diagnostic("native_dependency_not_found", `Observed dependency issue #${dependencyNumber} has no database id`, `relationships.dependsOn.${dependencyNumber}`));
    } else operations.push({ kind: "remove_dependency", dependencyNumber, dependencyDatabaseId });
  }
  if (diagnostics.length) return { ok: false, diagnostics };
  return { ok: true, plan: { operations } };
}

export interface RestResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type RestFetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body?: string;
}) => Promise<RestResponseLike>;

interface RestIssue { id?: number; number?: number; milestone?: { number?: number; title?: string } | null }

export class GitHubRestNativeGovernanceAdapter implements NativeGovernanceAdapter {
  constructor(private readonly token: string, private readonly fetcher: RestFetchLike = fetch as unknown as RestFetchLike) {}

  private async request(path: string, method = "GET", body?: Record<string, unknown>): Promise<RestResponseLike> {
    return this.fetcher(`https://api.github.com${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        "user-agent": "yukh-action",
        "x-github-api-version": "2026-03-10",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  private async issue(repository: string, issueNumber: number): Promise<RestIssue> {
    const response = await this.request(`/repos/${repository}/issues/${issueNumber}`);
    if (!response.ok) throw new Error(`GitHub REST issue lookup HTTP ${response.status}`);
    return response.json() as Promise<RestIssue>;
  }

  private async maybeIssue(repository: string, issueNumber: number): Promise<RestIssue | undefined> {
    const response = await this.request(`/repos/${repository}/issues/${issueNumber}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`GitHub REST issue lookup HTTP ${response.status}`);
    return response.json() as Promise<RestIssue>;
  }

  async discover(input: { repository: string; issueNumber: number; desired: NativeGovernanceState }): Promise<NativeGovernanceDiscovery> {
    const current = await this.issue(input.repository, input.issueNumber);
    if (!current.id) throw new Error(`GitHub REST issue #${input.issueNumber} did not include id`);

    const parentResponse = await this.request(`/repos/${input.repository}/issues/${input.issueNumber}/parent`);
    let parent: number | undefined;
    const parentDatabaseIds: Record<number, number> = {};
    if (parentResponse.ok) {
      const parentIssue = await parentResponse.json() as RestIssue;
      parent = parentIssue.number;
      if (parentIssue.number && parentIssue.id) parentDatabaseIds[parentIssue.number] = parentIssue.id;
    }
    else if (parentResponse.status !== 404) throw new Error(`GitHub REST parent lookup HTTP ${parentResponse.status}`);
    if (input.desired.parent !== undefined && parentDatabaseIds[input.desired.parent] === undefined) {
      const desiredParent = await this.maybeIssue(input.repository, input.desired.parent);
      if (desiredParent?.number && desiredParent.id) parentDatabaseIds[desiredParent.number] = desiredParent.id;
    }

    const dependenciesResponse = await this.request(`/repos/${input.repository}/issues/${input.issueNumber}/dependencies/blocked_by?per_page=100`);
    if (!dependenciesResponse.ok) throw new Error(`GitHub REST dependency lookup HTTP ${dependenciesResponse.status}`);
    const dependencyIssues = await dependenciesResponse.json() as RestIssue[];
    const dependencyDatabaseIds: Record<number, number> = {};
    for (const dependency of dependencyIssues) if (dependency.number && dependency.id) dependencyDatabaseIds[dependency.number] = dependency.id;
    for (const number of stable(input.desired.dependsOn)) {
      if (dependencyDatabaseIds[number] !== undefined) continue;
      const dependency = await this.maybeIssue(input.repository, number);
      if (dependency?.id) dependencyDatabaseIds[number] = dependency.id;
    }

    const milestoneNumbers: Record<string, number> = {};
    if (input.desired.milestone !== undefined) {
      const response = await this.request(`/repos/${input.repository}/milestones?state=all&per_page=100`);
      if (!response.ok) throw new Error(`GitHub REST milestone lookup HTTP ${response.status}`);
      for (const milestone of await response.json() as Array<{ number?: number; title?: string }>) {
        if (milestone.number && milestone.title) milestoneNumbers[milestone.title] = milestone.number;
      }
    }
    return {
      issueDatabaseId: current.id,
      observed: {
        ...(current.milestone?.title ? { milestone: current.milestone.title } : {}),
        ...(parent !== undefined ? { parent } : {}),
        dependsOn: stable(dependencyIssues.flatMap((value) => value.number ? [value.number] : [])),
      },
      milestoneNumbers,
      parentDatabaseIds,
      dependencyDatabaseIds,
    };
  }

  async apply(input: { repository: string; issueNumber: number; operation: NativeGovernanceOperation }): Promise<void> {
    const operation = input.operation;
    let response: RestResponseLike;
    switch (operation.kind) {
      case "set_milestone":
        response = await this.request(`/repos/${input.repository}/issues/${input.issueNumber}`, "PATCH", { milestone: operation.milestoneNumber });
        break;
      case "remove_parent":
        response = await this.request(`/repos/${input.repository}/issues/${operation.parentNumber}/sub_issue`, "DELETE", { sub_issue_id: operation.issueDatabaseId });
        break;
      case "set_parent":
        response = await this.request(`/repos/${input.repository}/issues/${operation.parentNumber}/sub_issues`, "POST", { sub_issue_id: operation.issueDatabaseId, replace_parent: true });
        break;
      case "add_dependency":
        response = await this.request(`/repos/${input.repository}/issues/${input.issueNumber}/dependencies/blocked_by`, "POST", { issue_id: operation.dependencyDatabaseId });
        break;
      case "remove_dependency":
        response = await this.request(`/repos/${input.repository}/issues/${input.issueNumber}/dependencies/blocked_by/${operation.dependencyDatabaseId}`, "DELETE");
        break;
    }
    if (!response.ok) throw new Error(`GitHub REST ${operation.kind} HTTP ${response.status}`);
  }
}

export async function applyNativeGovernance(input: {
  repository: string;
  issueNumber: number;
  operations: readonly NativeGovernanceOperation[];
  adapter: NativeGovernanceAdapter;
}): Promise<{ ok: boolean; applied: number; remaining: NativeGovernanceOperation[]; diagnostics: ContractDiagnostic[] }> {
  for (let index = 0; index < input.operations.length; index += 1) {
    const operation = input.operations[index]!;
    try {
      await input.adapter.apply({ repository: input.repository, issueNumber: input.issueNumber, operation });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const permission = /403|forbidden|permission|resource not accessible/i.test(message);
      return {
        ok: false,
        applied: index,
        remaining: input.operations.slice(index),
        diagnostics: [diagnostic(permission ? "native_governance_permission_denied" : "native_governance_mutation_failed", message, `native.${operation.kind}`)],
      };
    }
  }
  return { ok: true, applied: input.operations.length, remaining: [], diagnostics: [] };
}
