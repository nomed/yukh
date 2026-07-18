import type { ContractDiagnostic } from "./contract.js";
import type { GraphqlTransport, ProjectFieldDefinition } from "./project.js";

export type SupportedProjectValue = string | number;

export interface MutationTarget {
  projectId: string;
  issueContentId: string;
  itemId?: string;
  field: ProjectFieldDefinition;
  desiredValue: SupportedProjectValue;
  observedValue?: SupportedProjectValue;
}

export type ProjectMutationOperation =
  | {
      kind: "add_project_item";
      projectId: string;
      contentId: string;
    }
  | {
      kind: "set_project_field";
      projectId: string;
      itemId?: string;
      fieldId: string;
      fieldName: string;
      value: { singleSelectOptionId: string } | { number: number } | { text: string };
      desiredValue: SupportedProjectValue;
    };

export interface ProjectMutationPlan {
  mode: "dry-run";
  operations: ProjectMutationOperation[];
}

export interface AppliedMutation {
  operation: ProjectMutationOperation["kind"];
  itemId: string;
}

export interface MutationApplyResult {
  ok: boolean;
  applied: AppliedMutation[];
  diagnostics: ContractDiagnostic[];
  retryable: boolean;
  itemId?: string;
}

export type MutationPlanResult =
  | { ok: true; plan: ProjectMutationPlan }
  | { ok: false; diagnostics: ContractDiagnostic[] };

interface AddItemResponse {
  addProjectV2ItemById?: { item?: { id?: string | null } | null } | null;
}

interface UpdateFieldResponse {
  updateProjectV2ItemFieldValue?: { projectV2Item?: { id?: string | null } | null } | null;
}

const ADD_ITEM_MUTATION = `
mutation AddProjectItem($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
    item { id }
  }
}`;

const UPDATE_FIELD_MUTATION = `
mutation SetProjectField($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId,
    itemId: $itemId,
    fieldId: $fieldId,
    value: $value
  }) {
    projectV2Item { id }
  }
}`;

function diagnostic(code: string, message: string, path: string): ContractDiagnostic {
  return { code, message, path };
}

function normalizeMutationError(error: unknown, path: string): ContractDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("resource not accessible") || lower.includes("forbidden") || lower.includes("permission")) {
    return diagnostic(
      "project_mutation_permission_denied",
      "GitHub denied the Project mutation; verify project write permissions and token scopes",
      path,
    );
  }
  return diagnostic("project_mutation_failed", `GitHub Project mutation failed: ${message}`, path);
}

function sameValue(left: SupportedProjectValue | undefined, right: SupportedProjectValue): boolean {
  return left === right;
}

function resolveFieldValue(
  field: ProjectFieldDefinition,
  desiredValue: SupportedProjectValue,
): { ok: true; value: ProjectMutationOperation & { kind: "set_project_field" }["value"] } | { ok: false; diagnostic: ContractDiagnostic } {
  if (field.dataType === "SINGLE_SELECT") {
    if (typeof desiredValue !== "string") {
      return {
        ok: false,
        diagnostic: diagnostic("unsupported_field_value", `Project field '${field.name}' requires a string option`, `fields.${field.name}`),
      };
    }
    const option = field.options.find(({ name }) => name === desiredValue);
    if (!option) {
      return {
        ok: false,
        diagnostic: diagnostic("unsupported_field_mapping", `Project field '${field.name}' has no option named '${desiredValue}'`, `fields.${field.name}`),
      };
    }
    return { ok: true, value: { singleSelectOptionId: option.id } };
  }

  if (field.dataType === "NUMBER") {
    if (typeof desiredValue !== "number" || !Number.isFinite(desiredValue)) {
      return {
        ok: false,
        diagnostic: diagnostic("unsupported_field_value", `Project field '${field.name}' requires a finite number`, `fields.${field.name}`),
      };
    }
    return { ok: true, value: { number: desiredValue } };
  }

  if (field.dataType === "TEXT") {
    if (typeof desiredValue !== "string") {
      return {
        ok: false,
        diagnostic: diagnostic("unsupported_field_value", `Project field '${field.name}' requires text`, `fields.${field.name}`),
      };
    }
    return { ok: true, value: { text: desiredValue } };
  }

  return {
    ok: false,
    diagnostic: diagnostic(
      "unsupported_project_field_type",
      `Project field '${field.name}' uses unsupported type '${field.dataType}'`,
      `fields.${field.name}`,
    ),
  };
}

export function planProjectMutation(target: MutationTarget): MutationPlanResult {
  if (!target.projectId.trim() || !target.issueContentId.trim() || !target.field.id.trim()) {
    return {
      ok: false,
      diagnostics: [diagnostic("invalid_mutation_target", "project, issue content and field identifiers are required", "mutation")],
    };
  }

  const fieldValue = resolveFieldValue(target.field, target.desiredValue);
  if (!fieldValue.ok) return { ok: false, diagnostics: [fieldValue.diagnostic] };

  const operations: ProjectMutationOperation[] = [];
  if (!target.itemId) {
    operations.push({
      kind: "add_project_item",
      projectId: target.projectId,
      contentId: target.issueContentId,
    });
  }

  if (!sameValue(target.observedValue, target.desiredValue)) {
    operations.push({
      kind: "set_project_field",
      projectId: target.projectId,
      ...(target.itemId !== undefined ? { itemId: target.itemId } : {}),
      fieldId: target.field.id,
      fieldName: target.field.name,
      value: fieldValue.value,
      desiredValue: target.desiredValue,
    });
  }

  return { ok: true, plan: { mode: "dry-run", operations } };
}

export class SafeProjectMutationAdapter {
  constructor(private readonly transport: GraphqlTransport) {}

  async apply(plan: ProjectMutationPlan): Promise<MutationApplyResult> {
    const applied: AppliedMutation[] = [];
    const diagnostics: ContractDiagnostic[] = [];
    let resolvedItemId: string | undefined;

    for (const operation of plan.operations) {
      if (operation.kind === "add_project_item") {
        try {
          const response = await this.transport.execute<AddItemResponse>(ADD_ITEM_MUTATION, {
            projectId: operation.projectId,
            contentId: operation.contentId,
          });
          const itemId = response.addProjectV2ItemById?.item?.id ?? undefined;
          if (!itemId) {
            diagnostics.push(diagnostic("project_item_missing_after_add", "GitHub did not return the created Project item identifier", "projectItem"));
            break;
          }
          resolvedItemId = itemId;
          applied.push({ operation: operation.kind, itemId });
        } catch (error) {
          diagnostics.push(normalizeMutationError(error, "projectItem"));
          break;
        }
        continue;
      }

      const itemId = operation.itemId ?? resolvedItemId;
      if (!itemId) {
        diagnostics.push(diagnostic("project_item_id_unavailable", "Project field cannot be updated before an item identifier is available", `fields.${operation.fieldName}`));
        break;
      }

      try {
        const response = await this.transport.execute<UpdateFieldResponse>(UPDATE_FIELD_MUTATION, {
          projectId: operation.projectId,
          itemId,
          fieldId: operation.fieldId,
          value: operation.value,
        });
        const updatedItemId = response.updateProjectV2ItemFieldValue?.projectV2Item?.id ?? undefined;
        if (!updatedItemId) {
          diagnostics.push(diagnostic("project_field_update_unconfirmed", `GitHub did not confirm the update of '${operation.fieldName}'`, `fields.${operation.fieldName}`));
          break;
        }
        resolvedItemId = updatedItemId;
        applied.push({ operation: operation.kind, itemId: updatedItemId });
      } catch (error) {
        diagnostics.push(normalizeMutationError(error, `fields.${operation.fieldName}`));
        break;
      }
    }

    const result: MutationApplyResult = {
      ok: diagnostics.length === 0,
      applied,
      diagnostics,
      retryable: diagnostics.length > 0,
      ...(resolvedItemId !== undefined ? { itemId: resolvedItemId } : {}),
    };
    return result;
  }
}
