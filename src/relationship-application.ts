import type { ContractDiagnostic } from "./contract.js";
import type {
  RelationshipOperation,
  RelationshipPlan,
  RelationshipPlanResult,
} from "./relationships.js";
import { buildRelationshipPlan } from "./relationships.js";

export interface RelationshipMutationAdapter {
  apply(issueNumber: number, operation: RelationshipOperation): Promise<void>;
}

export interface AppliedRelationshipOperation {
  issueNumber: number;
  operation: RelationshipOperation;
}

export interface RelationshipApplicationResult {
  ok: boolean;
  applied: AppliedRelationshipOperation[];
  diagnostics: ContractDiagnostic[];
  retryable: boolean;
  remaining: RelationshipOperation[];
}

function diagnostic(code: string, message: string, path: string): ContractDiagnostic {
  return { code, message, path };
}

function operationPath(operation: RelationshipOperation): string {
  return `relationships.${operation.relationship}.${operation.issueNumber}`;
}

function normalizeError(error: unknown, operation: RelationshipOperation): ContractDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (
    lower.includes("resource not accessible") ||
    lower.includes("forbidden") ||
    lower.includes("permission")
  ) {
    return diagnostic(
      "relationship_permission_denied",
      "GitHub denied the relationship mutation; verify issue write permissions and token scopes",
      operationPath(operation),
    );
  }
  if (lower.includes("unsupported")) {
    return diagnostic(
      "unsupported_relationship_operation",
      `relationship operation is not supported: ${message}`,
      operationPath(operation),
    );
  }
  return diagnostic(
    "relationship_mutation_failed",
    `relationship mutation failed: ${message}`,
    operationPath(operation),
  );
}

export async function applyRelationshipPlan(
  plan: RelationshipPlan,
  adapter: RelationshipMutationAdapter,
): Promise<RelationshipApplicationResult> {
  const applied: AppliedRelationshipOperation[] = [];

  for (let index = 0; index < plan.operations.length; index += 1) {
    const operation = plan.operations[index];
    if (!operation) continue;
    try {
      await adapter.apply(plan.issueNumber, operation);
      applied.push({ issueNumber: plan.issueNumber, operation });
    } catch (error) {
      return {
        ok: false,
        applied,
        diagnostics: [normalizeError(error, operation)],
        retryable: true,
        remaining: plan.operations.slice(index),
      };
    }
  }

  return {
    ok: true,
    applied,
    diagnostics: [],
    retryable: false,
    remaining: [],
  };
}

export async function reconcileRelationships(
  input: Parameters<typeof buildRelationshipPlan>[0],
  adapter: RelationshipMutationAdapter,
): Promise<RelationshipApplicationResult | RelationshipPlanResult> {
  const planned = buildRelationshipPlan(input);
  if (!planned.ok) return planned;
  return applyRelationshipPlan(planned.plan, adapter);
}
