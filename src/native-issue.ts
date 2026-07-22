import type { ContractDiagnostic } from "./contract.js";
import type { GraphqlTransport } from "./project.js";

export interface NativeIssueType {
  id: string;
  name: string;
}

export interface NativeIssueFieldOption {
  id: string;
  name: string;
}

export interface NativeIssueField {
  id: string;
  name: string;
  dataType: string;
  options: NativeIssueFieldOption[];
}

export type NativeIssueMutationOperation =
  | { kind: "set_issue_type"; issueId: string; issueTypeId: string; desiredValue: string }
  | {
      kind: "set_issue_field";
      issueId: string;
      fieldId: string;
      fieldName: string;
      value: { singleSelectOptionId: string };
      desiredValue: string;
    };

export type NativeIssuePlanResult =
  | { ok: true; operations: NativeIssueMutationOperation[] }
  | { ok: false; diagnostics: ContractDiagnostic[] };

function diagnostic(code: string, message: string, path: string): ContractDiagnostic {
  return { code, message, path };
}

function exactlyOne<T>(
  values: readonly T[],
  path: string,
  missingCode: string,
  ambiguousCode: string,
  label: string,
): { ok: true; value: T } | { ok: false; diagnostic: ContractDiagnostic } {
  if (values.length === 1) return { ok: true, value: values[0]! };
  return {
    ok: false,
    diagnostic: diagnostic(
      values.length === 0 ? missingCode : ambiguousCode,
      values.length === 0 ? `${label} was not found` : `${label} is ambiguous`,
      path,
    ),
  };
}

export function planNativeIssueMutations(input: {
  issueId: string;
  desiredIssueType?: string;
  observedIssueType?: string;
  issueTypes: readonly NativeIssueType[];
  desiredIssueFields: Record<string, string | number>;
  observedIssueFields: Record<string, string | number>;
  issueFields: readonly NativeIssueField[];
}): NativeIssuePlanResult {
  const diagnostics: ContractDiagnostic[] = [];
  const operations: NativeIssueMutationOperation[] = [];

  if (!input.issueId.trim()) {
    return { ok: false, diagnostics: [diagnostic("invalid_native_issue_target", "Issue identifier is required", "native")] };
  }

  if (input.desiredIssueType !== undefined && input.desiredIssueType !== input.observedIssueType) {
    const resolved = exactlyOne(
      input.issueTypes.filter(({ name }) => name === input.desiredIssueType),
      "native.issueType",
      "issue_type_not_found",
      "ambiguous_issue_type",
      `Issue type '${input.desiredIssueType}'`,
    );
    if (!resolved.ok) diagnostics.push(resolved.diagnostic);
    else operations.push({
      kind: "set_issue_type",
      issueId: input.issueId,
      issueTypeId: resolved.value.id,
      desiredValue: input.desiredIssueType,
    });
  }

  for (const [fieldName, desiredValue] of Object.entries(input.desiredIssueFields).sort(([a], [b]) => a.localeCompare(b))) {
    if (input.observedIssueFields[fieldName] === desiredValue) continue;
    if (typeof desiredValue !== "string") {
      diagnostics.push(diagnostic("unsupported_issue_field_value", `Issue field '${fieldName}' requires a string value`, `native.issueFields.${fieldName}`));
      continue;
    }
    const field = exactlyOne(
      input.issueFields.filter(({ name }) => name === fieldName),
      `native.issueFields.${fieldName}`,
      "issue_field_not_found",
      "ambiguous_issue_field",
      `Issue field '${fieldName}'`,
    );
    if (!field.ok) {
      diagnostics.push(field.diagnostic);
      continue;
    }
    if (field.value.dataType !== "SINGLE_SELECT") {
      diagnostics.push(diagnostic("unsupported_issue_field_type", `Issue field '${fieldName}' uses unsupported type '${field.value.dataType}'`, `native.issueFields.${fieldName}`));
      continue;
    }
    const option = exactlyOne(
      field.value.options.filter(({ name }) => name === desiredValue),
      `native.issueFields.${fieldName}`,
      "issue_field_option_not_found",
      "ambiguous_issue_field_option",
      `Issue field '${fieldName}' option '${desiredValue}'`,
    );
    if (!option.ok) diagnostics.push(option.diagnostic);
    else operations.push({
      kind: "set_issue_field",
      issueId: input.issueId,
      fieldId: field.value.id,
      fieldName,
      value: { singleSelectOptionId: option.value.id },
      desiredValue,
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: diagnostics.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code)) };
  }
  return { ok: true, operations };
}

interface UpdateIssueResponse {
  updateIssue?: { issue?: { id?: string | null } | null } | null;
}

interface SetIssueFieldValueResponse {
  setIssueFieldValue?: { issue?: { id?: string | null } | null } | null;
}

const UPDATE_ISSUE_TYPE = `
mutation SetIssueType($input: UpdateIssueInput!) {
  updateIssue(input: $input) { issue { id } }
}`;

const SET_ISSUE_FIELD = `
mutation SetIssueField($input: SetIssueFieldValueInput!) {
  setIssueFieldValue(input: $input) { issue { id } }
}`;

export class SafeNativeIssueMutationAdapter {
  constructor(private readonly transport: GraphqlTransport) {}

  async apply(operations: readonly NativeIssueMutationOperation[]): Promise<{
    ok: boolean;
    applied: number;
    diagnostics: ContractDiagnostic[];
  }> {
    const diagnostics: ContractDiagnostic[] = [];
    let applied = 0;
    for (const operation of operations) {
      try {
        if (operation.kind === "set_issue_type") {
          const response = await this.transport.execute<UpdateIssueResponse>(UPDATE_ISSUE_TYPE, {
            input: { id: operation.issueId, issueTypeId: operation.issueTypeId },
          });
          if (response.updateIssue?.issue?.id !== operation.issueId) throw new Error("GitHub did not confirm the issue type update");
        } else {
          const response = await this.transport.execute<SetIssueFieldValueResponse>(SET_ISSUE_FIELD, {
            input: {
              issueId: operation.issueId,
              issueFields: [{ fieldId: operation.fieldId, singleSelectOptionId: operation.value.singleSelectOptionId }],
            },
          });
          if (response.setIssueFieldValue?.issue?.id !== operation.issueId) throw new Error(`GitHub did not confirm the update of '${operation.fieldName}'`);
        }
        applied += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        diagnostics.push(diagnostic("native_issue_mutation_failed", `GitHub issue mutation failed: ${message}`, operation.kind === "set_issue_type" ? "native.issueType" : `native.issueFields.${operation.fieldName}`));
        break;
      }
    }
    return { ok: diagnostics.length === 0, applied, diagnostics };
  }
}
