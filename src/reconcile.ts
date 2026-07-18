import type { ContractDiagnostic } from "./contract.js";
import type { ProjectMutationOperation, ProjectMutationPlan } from "./mutation.js";
import { resolveProjectFieldValue, SafeProjectMutationAdapter } from "./mutation.js";
import type { DesiredProjectState, ProjectPolicy } from "./policy.js";
import type { DiscoveredProjectState, ProjectFieldDefinition } from "./project.js";

export interface CompleteReconciliationInput {
  desired: DesiredProjectState;
  policy: ProjectPolicy;
  discovered: DiscoveredProjectState;
  issueContentId: string;
  now?: string;
}

export interface CompleteReconciliationPlan {
  mode: "dry-run";
  operations: ProjectMutationOperation[];
  warnings: ContractDiagnostic[];
}

export type CompleteReconciliationPlanResult =
  | { ok: true; plan: CompleteReconciliationPlan }
  | { ok: false; diagnostics: ContractDiagnostic[] };

export interface CompleteReconciliationApplyResult {
  ok: boolean;
  applied: number;
  remaining: ProjectMutationOperation[];
  diagnostics: ContractDiagnostic[];
  retryable: boolean;
  itemId?: string;
}

function diagnostic(code: string, message: string, path: string): ContractDiagnostic {
  return { code, message, path };
}

function findField(
  fields: readonly ProjectFieldDefinition[],
  name: string,
): { ok: true; field: ProjectFieldDefinition } | { ok: false; diagnostic: ContractDiagnostic } {
  const matches = fields.filter((field) => field.name === name);
  if (matches.length === 0) {
    return {
      ok: false,
      diagnostic: diagnostic("project_field_not_found", `Project field '${name}' was not found`, `fields.${name}`),
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      diagnostic: diagnostic("ambiguous_project_field", `Project contains multiple fields named '${name}'`, `fields.${name}`),
    };
  }
  return { ok: true, field: matches[0]! };
}

function resolveAutomaticIteration(field: ProjectFieldDefinition, now: string): string | undefined {
  const candidates = [...field.iterations]
    .filter((iteration) => iteration.startDate >= now)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
  return candidates[0]?.title;
}

function deriveStatus(desired: DesiredProjectState): string {
  if (desired.relationships.dependsOn.length > 0) return "Blocked";
  return "Ready";
}

function desiredManagedValues(
  input: CompleteReconciliationInput,
  diagnostics: ContractDiagnostic[],
): Record<string, string | number> {
  const values: Record<string, string | number> = { ...input.desired.fields };
  const iterationRule = input.policy.fields.iteration;
  if (iterationRule && input.desired.iteration.mode !== "none") {
    const resolvedField = findField(input.discovered.fields, iterationRule.projectField);
    if (!resolvedField.ok) diagnostics.push(resolvedField.diagnostic);
    else if (input.desired.iteration.mode === "explicit") {
      if (input.desired.iteration.value !== undefined) values[iterationRule.projectField] = input.desired.iteration.value;
    } else {
      const title = resolveAutomaticIteration(resolvedField.field, input.now ?? new Date(0).toISOString().slice(0, 10));
      if (!title) {
        diagnostics.push(diagnostic("automatic_iteration_unavailable", "No compatible current or future iteration is available", `fields.${iterationRule.projectField}`));
      } else values[iterationRule.projectField] = title;
    }
  }

  const statusRule = input.policy.fields.status;
  if (statusRule?.derived) values[statusRule.projectField] = deriveStatus(input.desired);
  return Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));
}

export function planCompleteProjectReconciliation(
  input: CompleteReconciliationInput,
): CompleteReconciliationPlanResult {
  const diagnostics: ContractDiagnostic[] = [];
  const warnings: ContractDiagnostic[] = [];
  if (!input.issueContentId.trim() || !input.discovered.project.id.trim()) {
    return {
      ok: false,
      diagnostics: [diagnostic("invalid_reconciliation_input", "Project and issue content identifiers are required", "reconciliation")],
    };
  }

  const desiredValues = desiredManagedValues(input, diagnostics);
  const operations: ProjectMutationOperation[] = [];
  if (!input.discovered.issueItem.present) {
    operations.push({
      kind: "add_project_item",
      projectId: input.discovered.project.id,
      contentId: input.issueContentId,
    });
  }

  for (const [fieldName, desiredValue] of Object.entries(desiredValues)) {
    const resolvedField = findField(input.discovered.fields, fieldName);
    if (!resolvedField.ok) {
      diagnostics.push(resolvedField.diagnostic);
      continue;
    }
    const resolvedValue = resolveProjectFieldValue(resolvedField.field, desiredValue);
    if (!resolvedValue.ok) {
      diagnostics.push(resolvedValue.diagnostic);
      continue;
    }
    const observedValue = input.discovered.issueItem.values[fieldName];
    if (observedValue === desiredValue) continue;
    operations.push({
      kind: "set_project_field",
      projectId: input.discovered.project.id,
      ...(input.discovered.issueItem.id !== undefined ? { itemId: input.discovered.issueItem.id } : {}),
      fieldId: resolvedField.field.id,
      fieldName,
      value: resolvedValue.value,
      desiredValue,
    });
  }

  for (const [fieldName, observedValue] of Object.entries(input.discovered.issueItem.values)) {
    if (!(fieldName in desiredValues)) {
      warnings.push(
        diagnostic(
          "preserved_human_owned_field",
          `Preserving unmanaged or human-owned field '${fieldName}' with value '${observedValue}'`,
          `fields.${fieldName}`,
        ),
      );
    }
  }

  if (diagnostics.length > 0) {
    return {
      ok: false,
      diagnostics: diagnostics.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code)),
    };
  }

  operations.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "add_project_item" ? -1 : 1;
    if (a.kind === "set_project_field" && b.kind === "set_project_field") {
      return a.fieldName.localeCompare(b.fieldName);
    }
    return 0;
  });

  return {
    ok: true,
    plan: {
      mode: "dry-run",
      operations,
      warnings: warnings.sort((a, b) => a.path.localeCompare(b.path)),
    },
  };
}

export async function applyCompleteProjectReconciliation(
  adapter: SafeProjectMutationAdapter,
  plan: CompleteReconciliationPlan,
): Promise<CompleteReconciliationApplyResult> {
  const mutationPlan: ProjectMutationPlan = { mode: "dry-run", operations: plan.operations };
  const result = await adapter.apply(mutationPlan);
  const applied = result.applied.length;
  return {
    ok: result.ok,
    applied,
    remaining: result.ok ? [] : plan.operations.slice(applied),
    diagnostics: result.diagnostics,
    retryable: result.retryable,
    ...(result.itemId !== undefined ? { itemId: result.itemId } : {}),
  };
}
