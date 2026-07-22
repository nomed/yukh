import type { ContractDiagnostic } from "./contract.js";
import { parseIssueContract } from "./contract.js";
import { SafeProjectMutationAdapter } from "./mutation.js";
import { planNativeIssueMutations, SafeNativeIssueMutationAdapter, type NativeIssueField, type NativeIssueType } from "./native-issue.js";
import { buildDesiredProjectState, loadProjectPolicy } from "./policy.js";
import { ReadOnlyProjectAdapter, type GraphqlTransport } from "./project.js";
import { applyCompleteProjectReconciliation, planCompleteProjectReconciliation, type CompleteReconciliationApplyResult } from "./reconcile.js";
import { buildReadOnlyReport, renderHumanReport, serializeReport } from "./report.js";
import { validateRuntimeInput, type RuntimeInput, type RuntimeMode } from "./runtime.js";

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<HttpResponseLike>;

export class GitHubGraphqlTransport implements GraphqlTransport {
  constructor(private readonly token: string, private readonly fetcher: FetchLike = fetch as unknown as FetchLike) {}

  async execute<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await this.fetcher("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        "user-agent": "yukh-action",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
    if (!response.ok) throw new Error(`GitHub GraphQL HTTP ${response.status}`);
    if (payload.errors?.length) throw new Error(payload.errors.map(({ message }) => message ?? "GraphQL error").join("; "));
    if (!payload.data) throw new Error("GitHub GraphQL response did not include data");
    return payload.data;
  }
}

interface IssueResponse {
  repository?: { issue?: {
    id?: string;
    number?: number;
    body?: string | null;
    issueType?: { id?: string; name?: string } | null;
    issueFieldValues?: { nodes?: Array<{
      __typename?: string;
      value?: string;
      field?: { id?: string; name?: string } | null;
    } | null> };
  } | null } | null;
  organization?: {
    issueTypes?: { nodes?: Array<{ id?: string; name?: string } | null> };
    issueFields?: { nodes?: Array<{
      __typename?: string;
      id?: string;
      name?: string;
      dataType?: string;
      options?: Array<{ id?: string; name?: string } | null>;
    } | null> };
  } | null;
}

const ISSUE_QUERY = `
query ResolveIssue($owner: String!, $repository: String!, $number: Int!) {
  repository(owner: $owner, name: $repository) {
    issue(number: $number) {
      id number body
      issueType { id name }
      issueFieldValues(first: 100) {
        nodes {
          __typename
          ... on IssueFieldSingleSelectValue {
            value
            field {
              __typename
              ... on IssueFieldSingleSelect { id name }
            }
          }
        }
      }
    }
  }
  organization(login: $owner) {
    issueTypes(first: 100) { nodes { id name } }
    issueFields(first: 100) {
      nodes {
        __typename
        ... on IssueFieldDate { id name dataType }
        ... on IssueFieldNumber { id name dataType }
        ... on IssueFieldSingleSelect { id name dataType options { id name } }
        ... on IssueFieldText { id name dataType }
      }
    }
  }
}`;

export interface ConnectedRuntimeInput extends Omit<RuntimeInput, "issueBody" | "tokenAvailable"> {
  token?: string;
  issueBody?: string;
  now?: string;
}

export interface ConnectedRuntimeOutcome {
  ok: boolean;
  mode: RuntimeMode;
  human: string;
  json: string;
  summary: string;
  diagnostics: ContractDiagnostic[];
  applied: number;
  remaining: number;
  retryable: boolean;
  writes: number;
}

function diagnostic(code: string, message: string, path: string): ContractDiagnostic {
  return { code, message, path };
}

function errorOutcome(mode: RuntimeMode, diagnostics: ContractDiagnostic[]): ConnectedRuntimeOutcome {
  const stable = [...diagnostics].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  const summary = [
    `# Yukh ${mode}`,
    "",
    "**Status:** error",
    `**Errors:** ${stable.length}`,
    "",
    ...stable.map(({ code, path, message }) => `- \`${path}\` — ${message} (\`${code}\`)`),
  ].join("\n") + "\n";
  return {
    ok: false,
    mode,
    human: stable.map(({ path, message }) => `ERROR ${path}: ${message}`).join("\n"),
    json: `${JSON.stringify({ status: "error", diagnostics: stable }, null, 2)}\n`,
    summary,
    diagnostics: stable,
    applied: 0,
    remaining: 0,
    retryable: stable.some(({ code }) => code.includes("permission") || code.includes("api") || code.includes("mutation")),
    writes: 0,
  };
}

function applySummary(repository: string, issueNumber: number, mode: RuntimeMode, planned: number, apply?: Pick<CompleteReconciliationApplyResult, "ok" | "applied" | "retryable" | "diagnostics"> & { remaining: readonly unknown[] }): string {
  const lines = [
    "# Yukh connected reconciliation",
    "",
    `**Issue:** ${repository}#${issueNumber}`,
    `**Mode:** ${mode}`,
    `**Planned operations:** ${planned}`,
    `**Applied operations:** ${apply?.applied ?? 0}`,
    `**Remaining operations:** ${apply?.remaining.length ?? planned}`,
    `**Retryable:** ${apply?.retryable ?? false}`,
    `**Status:** ${apply ? (apply.ok ? "success" : "error") : "dry-run"}`,
  ];
  if (apply?.diagnostics.length) {
    lines.push("", "## Diagnostics", ...apply.diagnostics.map(({ code, path, message }) => `- \`${path}\` — ${message} (\`${code}\`)`));
  } else if (planned === 0) {
    lines.push("", "No drift detected.");
  }
  return `${lines.join("\n")}\n`;
}

export async function runConnectedActionRuntime(
  input: ConnectedRuntimeInput,
  transportOverride?: GraphqlTransport,
): Promise<ConnectedRuntimeOutcome> {
  const mode: RuntimeMode = input.mode === "apply" ? "apply" : "dry-run";
  const token = input.token?.trim();
  const preliminary = validateRuntimeInput({
    ...input,
    issueBody: input.issueBody ?? "pending",
    tokenAvailable: Boolean(token),
  });
  if (!preliminary.ok) return errorOutcome(preliminary.mode, preliminary.diagnostics);
  if (!token && !transportOverride) return errorOutcome(mode, [diagnostic("github_token_missing", "connected runtime requires GITHUB_TOKEN", "token")]);

  const environment = preliminary.value;
  const [owner, repositoryName] = environment.repository.split("/");
  if (!owner || !repositoryName) return errorOutcome(mode, [diagnostic("invalid_repository", "repository must use owner/name format", "repository")]);
  const transport = transportOverride ?? new GitHubGraphqlTransport(token!);

  let issue: {
    id: string;
    body: string;
    observedIssueType?: string;
    observedIssueFields: Record<string, string | number>;
    issueTypes: NativeIssueType[];
    issueFields: NativeIssueField[];
  };
  try {
    const response = await transport.execute<IssueResponse>(ISSUE_QUERY, { owner, repository: repositoryName, number: environment.issueNumber });
    const node = response.repository?.issue;
    if (!node?.id) return errorOutcome(mode, [diagnostic("issue_not_found", `issue #${environment.issueNumber} was not found`, "issue")]);
    const observedIssueFields: Record<string, string | number> = {};
    for (const value of node.issueFieldValues?.nodes ?? []) {
      if (value?.field?.name && typeof value.value === "string") observedIssueFields[value.field.name] = value.value;
    }
    const issueTypes = (response.organization?.issueTypes?.nodes ?? [])
      .filter((value): value is { id: string; name: string } => Boolean(value?.id && value?.name))
      .map(({ id, name }) => ({ id, name }));
    const issueFields = (response.organization?.issueFields?.nodes ?? [])
      .filter((value): value is NonNullable<typeof value> & { id: string; name: string; dataType: string } =>
        Boolean(value?.id && value?.name && value?.dataType))
      .map(({ id, name, dataType, options }) => ({
        id,
        name,
        dataType,
        options: (options ?? [])
          .filter((value): value is { id: string; name: string } => Boolean(value?.id && value?.name))
          .map(({ id: optionId, name: optionName }) => ({ id: optionId, name: optionName })),
      }));
    issue = {
      id: node.id,
      body: input.issueBody ?? node.body ?? "",
      ...(node.issueType?.name ? { observedIssueType: node.issueType.name } : {}),
      observedIssueFields,
      issueTypes,
      issueFields,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const permission = /resource not accessible|forbidden|permission/i.test(message);
    return errorOutcome(mode, [diagnostic(permission ? "github_permission_denied" : "github_api_error", `GitHub issue lookup failed: ${message}`, "issue")]);
  }

  const policyResult = loadProjectPolicy(environment.policySource);
  if (!policyResult.ok) return errorOutcome(mode, policyResult.diagnostics);
  const contractResult = parseIssueContract(issue.body, { issueNumber: environment.issueNumber, artifact: `${environment.repository}#${environment.issueNumber}` });
  if (!contractResult.ok) return errorOutcome(mode, contractResult.diagnostics);
  const desiredResult = buildDesiredProjectState(contractResult.contract, policyResult.value);
  if (!desiredResult.ok) return errorOutcome(mode, desiredResult.diagnostics);

  const discovered = await new ReadOnlyProjectAdapter(transport).discover({
    owner: policyResult.value.project.owner,
    projectNumber: environment.projectNumber,
    repository: environment.repository,
    issueNumber: environment.issueNumber,
  });
  if (!discovered.ok) return errorOutcome(mode, discovered.diagnostics);

  const planned = planCompleteProjectReconciliation({
    desired: desiredResult.value,
    policy: policyResult.value,
    discovered: discovered.value,
    issueContentId: issue.id,
    ...(input.now !== undefined ? { now: input.now } : {}),
  });
  if (!planned.ok) return errorOutcome(mode, planned.diagnostics);
  const nativePlanned = planNativeIssueMutations({
    issueId: issue.id,
    ...(desiredResult.value.native.issueType !== undefined ? { desiredIssueType: desiredResult.value.native.issueType } : {}),
    ...(issue.observedIssueType !== undefined ? { observedIssueType: issue.observedIssueType } : {}),
    issueTypes: issue.issueTypes,
    desiredIssueFields: desiredResult.value.native.issueFields,
    observedIssueFields: issue.observedIssueFields,
    issueFields: issue.issueFields,
  });
  if (!nativePlanned.ok) return errorOutcome(mode, nativePlanned.diagnostics);
  const totalPlanned = planned.plan.operations.length + nativePlanned.operations.length;

  const report = buildReadOnlyReport({
    issueBody: issue.body,
    policySource: environment.policySource,
    observed: discovered.value.observed,
    issueNumber: environment.issueNumber,
    artifact: `${environment.repository}#${environment.issueNumber}`,
  });

  if (mode === "dry-run") {
    return {
      ok: report.status !== "error",
      mode,
      human: renderHumanReport(report),
      json: serializeReport(report),
      summary: applySummary(environment.repository, environment.issueNumber, mode, totalPlanned),
      diagnostics: [...report.diagnostics, ...planned.plan.warnings],
      applied: 0,
      remaining: totalPlanned,
      retryable: false,
      writes: 0,
    };
  }

  const projectApplied = await applyCompleteProjectReconciliation(new SafeProjectMutationAdapter(transport), planned.plan);
  if (!projectApplied.ok) {
    return {
      ok: false,
      mode,
      human: `Applied ${projectApplied.applied}; ${projectApplied.remaining.length + nativePlanned.operations.length} operation(s) remain.`,
      json: `${JSON.stringify({ status: "error", mode, applied: projectApplied.applied, remaining: [...projectApplied.remaining, ...nativePlanned.operations], retryable: projectApplied.retryable, diagnostics: projectApplied.diagnostics }, null, 2)}\n`,
      summary: applySummary(environment.repository, environment.issueNumber, mode, totalPlanned, {
        ...projectApplied,
        remaining: [...projectApplied.remaining, ...nativePlanned.operations],
      }),
      diagnostics: projectApplied.diagnostics,
      applied: projectApplied.applied,
      remaining: projectApplied.remaining.length + nativePlanned.operations.length,
      retryable: projectApplied.retryable,
      writes: projectApplied.applied,
    };
  }
  const nativeApplied = await new SafeNativeIssueMutationAdapter(transport).apply(nativePlanned.operations);
  const appliedCount = projectApplied.applied + nativeApplied.applied;
  const remainingCount = nativePlanned.operations.length - nativeApplied.applied;
  const combinedApply = {
    ok: nativeApplied.ok,
    applied: appliedCount,
    remaining: nativePlanned.operations.slice(nativeApplied.applied),
    diagnostics: nativeApplied.diagnostics,
    retryable: !nativeApplied.ok,
  };
  return {
    ok: combinedApply.ok,
    mode,
    human: combinedApply.ok ? `Applied ${appliedCount} operation(s).` : `Applied ${appliedCount}; ${remainingCount} operation(s) remain.`,
    json: `${JSON.stringify({ status: combinedApply.ok ? "success" : "error", mode, applied: appliedCount, remaining: combinedApply.remaining, retryable: combinedApply.retryable, diagnostics: combinedApply.diagnostics }, null, 2)}\n`,
    summary: applySummary(environment.repository, environment.issueNumber, mode, totalPlanned, combinedApply),
    diagnostics: combinedApply.diagnostics,
    applied: appliedCount,
    remaining: remainingCount,
    retryable: combinedApply.retryable,
    writes: appliedCount,
  };
}
