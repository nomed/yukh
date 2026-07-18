import type { ContractDiagnostic, IssueContract } from "./contract.js";
import { parseIssueContract } from "./contract.js";
import type { DesiredProjectState, ProjectPolicy } from "./policy.js";
import { buildDesiredProjectState, loadProjectPolicy } from "./policy.js";

export interface ObservedProjectState {
  projectItemPresent: boolean;
  fields: Record<string, string | number>;
  milestone?: string;
  iteration?: string;
  relationships: {
    parent?: number;
    children: number[];
    dependsOn: number[];
    blocks: number[];
  };
}

export type DifferenceKind = "planned_change" | "warning";

export interface ReconciliationDifference {
  kind: DifferenceKind;
  action: string;
  path: string;
  desired?: unknown;
  observed?: unknown;
  message: string;
}

export interface ReconciliationReport {
  schemaVersion: 1;
  mode: "read-only";
  status: "no-op" | "changes" | "warning" | "error";
  contract: IssueContract | null;
  policy: ProjectPolicy | null;
  desired: DesiredProjectState | null;
  observed: ObservedProjectState;
  differences: ReconciliationDifference[];
  diagnostics: ContractDiagnostic[];
}

export interface BuildReportInput {
  issueBody: string;
  policySource: string;
  observed?: Partial<ObservedProjectState>;
  issueNumber?: number;
  artifact?: string;
}

function stableNumbers(values: readonly number[] | undefined): number[] {
  return [...new Set(values ?? [])].sort((a, b) => a - b);
}

export function normalizeObservedState(
  observed: Partial<ObservedProjectState> | undefined,
): ObservedProjectState {
  const relationships = observed?.relationships;
  return {
    projectItemPresent: observed?.projectItemPresent ?? false,
    fields: Object.fromEntries(
      Object.entries(observed?.fields ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    ...(observed?.milestone !== undefined
      ? { milestone: observed.milestone }
      : {}),
    ...(observed?.iteration !== undefined
      ? { iteration: observed.iteration }
      : {}),
    relationships: {
      ...(relationships?.parent !== undefined
        ? { parent: relationships.parent }
        : {}),
      children: stableNumbers(relationships?.children),
      dependsOn: stableNumbers(relationships?.dependsOn),
      blocks: stableNumbers(relationships?.blocks),
    },
  };
}

function stableDiagnostics(
  diagnostics: readonly ContractDiagnostic[],
): ContractDiagnostic[] {
  return [...diagnostics].sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function addDifference(
  differences: ReconciliationDifference[],
  difference: ReconciliationDifference,
): void {
  differences.push(difference);
}

function compareDesiredToObserved(
  desired: DesiredProjectState,
  observed: ObservedProjectState,
  policy: ProjectPolicy,
): ReconciliationDifference[] {
  const differences: ReconciliationDifference[] = [];

  if (!observed.projectItemPresent) {
    addDifference(differences, {
      kind: "planned_change",
      action: "add_project_item",
      path: "projectItemPresent",
      desired: true,
      observed: false,
      message: `issue must be added to Project '${desired.project.name}'`,
    });
  }

  for (const [field, value] of Object.entries(desired.fields)) {
    const current = observed.fields[field];
    if (current !== value) {
      addDifference(differences, {
        kind: "planned_change",
        action: "set_field",
        path: `fields.${field}`,
        desired: value,
        ...(current !== undefined ? { observed: current } : {}),
        message: `set Project field '${field}'`,
      });
    }
  }

  for (const [field, value] of Object.entries(observed.fields)) {
    if (!(field in desired.fields)) {
      addDifference(differences, {
        kind: "warning",
        action: "preserve_unmanaged_field",
        path: `fields.${field}`,
        observed: value,
        message: policy.safety.overwriteHumanValues
          ? `observed field '${field}' is not produced by desired state`
          : `preserving unmanaged or human-owned field '${field}'`,
      });
    }
  }

  if (desired.milestone !== observed.milestone) {
    addDifference(differences, {
      kind: "planned_change",
      action: "set_milestone",
      path: "milestone",
      ...(desired.milestone !== undefined ? { desired: desired.milestone } : {}),
      ...(observed.milestone !== undefined ? { observed: observed.milestone } : {}),
      message: "reconcile milestone",
    });
  }

  const desiredIteration =
    desired.iteration.mode === "explicit"
      ? desired.iteration.value
      : desired.iteration.mode === "auto"
        ? "auto"
        : undefined;
  if (desiredIteration !== observed.iteration) {
    addDifference(differences, {
      kind: "planned_change",
      action: "set_iteration",
      path: "iteration",
      ...(desiredIteration !== undefined ? { desired: desiredIteration } : {}),
      ...(observed.iteration !== undefined ? { observed: observed.iteration } : {}),
      message:
        desired.iteration.mode === "auto"
          ? "resolve and assign an iteration according to policy"
          : "reconcile iteration",
    });
  }

  if (desired.relationships.parent !== observed.relationships.parent) {
    addDifference(differences, {
      kind: "planned_change",
      action: "set_parent",
      path: "relationships.parent",
      ...(desired.relationships.parent !== undefined
        ? { desired: desired.relationships.parent }
        : {}),
      ...(observed.relationships.parent !== undefined
        ? { observed: observed.relationships.parent }
        : {}),
      message: "reconcile parent relationship",
    });
  }

  const relationshipLists = ["children", "dependsOn", "blocks"] as const;
  for (const relationship of relationshipLists) {
    const wanted = stableNumbers(desired.relationships[relationship]);
    const current = stableNumbers(observed.relationships[relationship]);
    if (!sameNumbers(wanted, current)) {
      addDifference(differences, {
        kind: "planned_change",
        action: `set_${relationship}`,
        path: `relationships.${relationship}`,
        desired: wanted,
        observed: current,
        message: `reconcile ${relationship} relationships`,
      });
    }
  }

  return differences.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.kind.localeCompare(right.kind) ||
      left.action.localeCompare(right.action),
  );
}

export function buildReadOnlyReport(input: BuildReportInput): ReconciliationReport {
  const observed = normalizeObservedState(input.observed);
  const parsed = parseIssueContract(input.issueBody, {
    ...(input.issueNumber !== undefined ? { issueNumber: input.issueNumber } : {}),
    ...(input.artifact !== undefined ? { artifact: input.artifact } : {}),
  });

  if (!parsed.ok) {
    return {
      schemaVersion: 1,
      mode: "read-only",
      status: "error",
      contract: null,
      policy: null,
      desired: null,
      observed,
      differences: [],
      diagnostics: stableDiagnostics(parsed.diagnostics),
    };
  }

  const loaded = loadProjectPolicy(input.policySource);
  if (!loaded.ok) {
    return {
      schemaVersion: 1,
      mode: "read-only",
      status: "error",
      contract: parsed.contract,
      policy: null,
      desired: null,
      observed,
      differences: [],
      diagnostics: stableDiagnostics(loaded.diagnostics),
    };
  }

  const built = buildDesiredProjectState(parsed.contract, loaded.value);
  if (!built.ok) {
    return {
      schemaVersion: 1,
      mode: "read-only",
      status: "error",
      contract: parsed.contract,
      policy: loaded.value,
      desired: null,
      observed,
      differences: [],
      diagnostics: stableDiagnostics(built.diagnostics),
    };
  }

  const differences = compareDesiredToObserved(
    built.value,
    observed,
    loaded.value,
  );
  const hasChanges = differences.some(({ kind }) => kind === "planned_change");
  const hasWarnings = differences.some(({ kind }) => kind === "warning");

  return {
    schemaVersion: 1,
    mode: "read-only",
    status: hasChanges ? "changes" : hasWarnings ? "warning" : "no-op",
    contract: parsed.contract,
    policy: loaded.value,
    desired: built.value,
    observed,
    differences,
    diagnostics: [],
  };
}

export function renderHumanReport(report: ReconciliationReport): string {
  const lines = [
    `Yukh read-only reconciliation: ${report.status}`,
    `Mode: ${report.mode}`,
  ];

  if (report.diagnostics.length > 0) {
    lines.push(`Errors: ${report.diagnostics.length}`);
    for (const diagnostic of report.diagnostics) {
      lines.push(`- ERROR ${diagnostic.path}: ${diagnostic.message} [${diagnostic.code}]`);
    }
    return lines.join("\n");
  }

  const changes = report.differences.filter(
    ({ kind }) => kind === "planned_change",
  );
  const warnings = report.differences.filter(({ kind }) => kind === "warning");
  lines.push(`Planned changes: ${changes.length}`);
  lines.push(`Warnings: ${warnings.length}`);

  for (const difference of report.differences) {
    const label = difference.kind === "warning" ? "WARN" : "PLAN";
    lines.push(`- ${label} ${difference.path}: ${difference.message}`);
  }

  if (report.differences.length === 0) {
    lines.push("No drift detected.");
  }

  return lines.join("\n");
}

export function serializeReport(report: ReconciliationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
