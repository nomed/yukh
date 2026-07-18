import type { ContractDiagnostic } from "./contract.js";
import { parseIssueContract } from "./contract.js";
import { SafeProjectMutationAdapter } from "./mutation.js";
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
  repository?: { issue?: { id?: string; number?: number; body?: string | null } | null } | null;
}

const ISSUE_QUERY = `
query ResolveIssue($owner: String!, $repository: String!, $number: Int!) {
  repository(owner: $owner, name: $repository) {
    issue(number: $number) { id number body }
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

function applySummary(repository: string, issueNumber: number, mode: RuntimeMode, planned: number, apply?: CompleteReconciliationApplyResult): string {
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

  let issue: { id: string; body: string };
  try {
    const response = await transport.execute<IssueResponse>(ISSUE_QUERY, { owner, repository: repositoryName, number: environment.issueNumber });
    const node = response.repository?.issue;
    if (!node?.id) return errorOutcome(mode, [diagnostic("issue_not_found", `issue #${environment.issueNumber} was not found`, "issue")]);
    issue = { id: node.id, body: input.issueBody ?? node.body ?? "" };
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
      summary: applySummary(environment.repository, environment.issueNumber, mode, planned.plan.operations.length),
      diagnostics: [...report.diagnostics, ...planned.plan.warnings],
      applied: 0,
      remaining: planned.plan.operations.length,
      retryable: false,
      writes: 0,
    };
  }

  const applied = await applyCompleteProjectReconciliation(new SafeProjectMutationAdapter(transport), planned.plan);
  return {
    ok: applied.ok,
    mode,
    human: applied.ok ? `Applied ${applied.applied} operation(s).` : `Applied ${applied.applied}; ${applied.remaining.length} operation(s) remain.`,
    json: `${JSON.stringify({ status: applied.ok ? "success" : "error", mode, applied: applied.applied, remaining: applied.remaining, retryable: applied.retryable, diagnostics: applied.diagnostics }, null, 2)}\n`,
    summary: applySummary(environment.repository, environment.issueNumber, mode, planned.plan.operations.length, applied),
    diagnostics: applied.diagnostics,
    applied: applied.applied,
    remaining: applied.remaining.length,
    retryable: applied.retryable,
    writes: applied.applied,
  };
}
