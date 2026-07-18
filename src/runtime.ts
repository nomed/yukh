import type { ContractDiagnostic } from "./contract.js";
import type { ObservedProjectState, ReconciliationReport } from "./report.js";
import { buildReadOnlyReport, renderHumanReport, serializeReport } from "./report.js";

export type RuntimeMode = "dry-run" | "apply";

export interface RuntimeEnvironment {
  repository: string;
  issueNumber: number;
  projectNumber: number;
  mode: RuntimeMode;
  policyPath: string;
  issueBody: string;
  policySource: string;
  observed?: Partial<ObservedProjectState>;
  applyEnabled: boolean;
  tokenAvailable: boolean;
}

export interface RuntimeInput {
  repository?: string;
  issueNumber?: string | number;
  projectNumber?: string | number;
  mode?: string;
  policyPath?: string;
  issueBody?: string;
  policySource?: string;
  observed?: Partial<ObservedProjectState>;
  applyEnabled?: string | boolean;
  tokenAvailable?: boolean;
}

export interface RuntimeOutcome {
  ok: boolean;
  mode: RuntimeMode;
  report?: ReconciliationReport;
  human: string;
  json: string;
  summary: string;
  diagnostics: ContractDiagnostic[];
}

function diagnostic(code: string, message: string, path: string): ContractDiagnostic {
  return { code, message, path };
}

function positiveInteger(value: string | number | undefined): number | undefined {
  const number = typeof value === "number" ? value : value === undefined ? NaN : Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function enabled(value: string | boolean | undefined): boolean {
  return value === true || value === "true" || value === "1";
}

export function validateRuntimeInput(input: RuntimeInput):
  | { ok: true; value: RuntimeEnvironment }
  | { ok: false; mode: RuntimeMode; diagnostics: ContractDiagnostic[] } {
  const diagnostics: ContractDiagnostic[] = [];
  const mode: RuntimeMode = input.mode === "apply" ? "apply" : "dry-run";
  if (input.mode !== undefined && input.mode !== "dry-run" && input.mode !== "apply") {
    diagnostics.push(diagnostic("invalid_runtime_mode", "mode must be 'dry-run' or 'apply'", "mode"));
  }
  const repository = input.repository?.trim();
  if (!repository || !repository.includes("/")) {
    diagnostics.push(diagnostic("invalid_repository", "repository must use owner/name format", "repository"));
  }
  const issueNumber = positiveInteger(input.issueNumber);
  if (!issueNumber) diagnostics.push(diagnostic("invalid_issue_number", "issue number must be a positive integer", "issueNumber"));
  const projectNumber = positiveInteger(input.projectNumber);
  if (!projectNumber) diagnostics.push(diagnostic("invalid_project_number", "project number must be a positive integer", "projectNumber"));
  if (!input.issueBody) diagnostics.push(diagnostic("missing_issue_body", "issue body is required", "issueBody"));
  if (!input.policySource) diagnostics.push(diagnostic("missing_policy", "project policy source is required", "policySource"));

  const applyEnabled = enabled(input.applyEnabled);
  if (mode === "apply" && !applyEnabled) {
    diagnostics.push(diagnostic("apply_not_enabled", "apply mode requires apply_enabled=true", "applyEnabled"));
  }
  if (mode === "apply" && !input.tokenAvailable) {
    diagnostics.push(diagnostic("apply_token_missing", "apply mode requires a GitHub token with Project write access", "token"));
  }

  if (diagnostics.length > 0 || !repository || !issueNumber || !projectNumber || !input.issueBody || !input.policySource) {
    return { ok: false, mode, diagnostics: diagnostics.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code)) };
  }
  return {
    ok: true,
    value: {
      repository,
      issueNumber,
      projectNumber,
      mode,
      policyPath: input.policyPath?.trim() || ".yukh/project.yaml",
      issueBody: input.issueBody,
      policySource: input.policySource,
      ...(input.observed !== undefined ? { observed: input.observed } : {}),
      applyEnabled,
      tokenAvailable: input.tokenAvailable ?? false,
    },
  };
}

function diagnosticsSummary(mode: RuntimeMode, diagnostics: ContractDiagnostic[]): string {
  return [
    `# Yukh ${mode}`,
    "",
    "**Status:** error",
    `**Errors:** ${diagnostics.length}`,
    "",
    ...diagnostics.map(({ code, path, message }) => `- \`${path}\` — ${message} (\`${code}\`)`),
  ].join("\n");
}

export function buildStepSummary(report: ReconciliationReport, repository: string, issueNumber: number): string {
  const changes = report.differences.filter(({ kind }) => kind === "planned_change").length;
  const warnings = report.differences.filter(({ kind }) => kind === "warning").length;
  const lines = [
    "# Yukh reconciliation",
    "",
    `**Issue:** ${repository}#${issueNumber}`,
    `**Mode:** ${report.mode}`,
    `**Status:** ${report.status}`,
    `**Planned changes:** ${changes}`,
    `**Warnings:** ${warnings}`,
  ];
  if (report.diagnostics.length > 0) {
    lines.push("", "## Diagnostics", ...report.diagnostics.map(({ code, path, message }) => `- \`${path}\` — ${message} (\`${code}\`)`));
  } else if (report.differences.length > 0) {
    lines.push("", "## Plan", ...report.differences.map(({ kind, path, message }) => `- **${kind === "warning" ? "Warning" : "Change"}** \`${path}\` — ${message}`));
  } else {
    lines.push("", "No drift detected.");
  }
  return `${lines.join("\n")}\n`;
}

export function runActionRuntime(input: RuntimeInput): RuntimeOutcome {
  const validated = validateRuntimeInput(input);
  if (!validated.ok) {
    const summary = diagnosticsSummary(validated.mode, validated.diagnostics);
    return {
      ok: false,
      mode: validated.mode,
      human: validated.diagnostics.map(({ path, message }) => `ERROR ${path}: ${message}`).join("\n"),
      json: `${JSON.stringify({ status: "error", diagnostics: validated.diagnostics }, null, 2)}\n`,
      summary: `${summary}\n`,
      diagnostics: validated.diagnostics,
    };
  }

  const environment = validated.value;
  const report = buildReadOnlyReport({
    issueBody: environment.issueBody,
    policySource: environment.policySource,
    ...(environment.observed !== undefined ? { observed: environment.observed } : {}),
    issueNumber: environment.issueNumber,
    artifact: `${environment.repository}#${environment.issueNumber}`,
  });
  return {
    ok: report.status !== "error",
    mode: environment.mode,
    report,
    human: renderHumanReport(report),
    json: serializeReport(report),
    summary: buildStepSummary(report, environment.repository, environment.issueNumber),
    diagnostics: report.diagnostics,
  };
}
