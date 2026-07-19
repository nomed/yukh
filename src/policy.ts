import { parseDocument } from "yaml";
import type { ContractDiagnostic, IssueContract } from "./contract.js";
import { buildEffectiveProjectSchema, isYukhManagedField, type ProjectFieldOwnership } from "./effective-schema.js";

const CONTRACT_FIELDS = ["kind", "area", "priority", "size", "estimate", "iteration"] as const;
type ContractField = (typeof CONTRACT_FIELDS)[number];

export interface PolicyField {
  projectField: string;
  required: boolean;
  type: "string" | "number";
  derived: boolean;
  ownership?: ProjectFieldOwnership;
  values: Record<string, string>;
}

export interface ProjectWorkflow {
  backlog: string;
  ready: string;
  inProgress: string;
  review: string;
  blocked: string;
  done: string;
}

export interface ProjectPolicy {
  version: 1;
  project: { owner: string; repository: string; name: string };
  contract: { marker: string; schema: 1 };
  fields: Partial<Record<ContractField | "status", PolicyField>>;
  milestones: Record<string, string>;
  defaults: { execution?: "agent" | "human" | "hybrid" };
  workflow: ProjectWorkflow;
  scheduling: { automaticIteration: boolean };
  safety: {
    overwriteHumanValues: boolean;
    failOnUnknownValues: boolean;
    commentOnValidationError: boolean;
  };
}

export interface DesiredProjectState {
  project: { owner: string; repository: string; name: string };
  fields: Record<string, string | number>;
  milestone?: string;
  iteration: { mode: "none" | "auto" | "explicit"; value?: string };
  execution: "agent" | "human" | "hybrid";
  relationships: { parent?: number; children: number[]; dependsOn: number[]; blocks: number[] };
}

export type PolicyResult<T> = { ok: true; value: T } | { ok: false; diagnostics: ContractDiagnostic[] };

function diag(code: string, message: string, path: string): ContractDiagnostic { return { code, message, path }; }
function objectAt(value: unknown, path: string, diagnostics: ContractDiagnostic[]): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    diagnostics.push(diag("invalid_policy_type", `${path} must be a mapping`, path));
    return undefined;
  }
  return value as Record<string, unknown>;
}
function stringAt(value: unknown, path: string, diagnostics: ContractDiagnostic[]): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    diagnostics.push(diag("invalid_policy_type", `${path} must be a non-empty string`, path));
    return undefined;
  }
  return value.trim();
}
function optionalString(value: unknown, path: string, diagnostics: ContractDiagnostic[], fallback: string): string {
  if (value === undefined) return fallback;
  return stringAt(value, path, diagnostics) ?? fallback;
}
function booleanAt(value: unknown, path: string, diagnostics: ContractDiagnostic[], fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    diagnostics.push(diag("invalid_policy_type", `${path} must be a boolean`, path));
    return fallback;
  }
  return value;
}
function stringMap(value: unknown, path: string, diagnostics: ContractDiagnostic[]): Record<string, string> {
  if (value === undefined) return {};
  const raw = objectAt(value, path, diagnostics);
  if (!raw) return {};
  const result: Record<string, string> = {};
  for (const key of Object.keys(raw).sort()) {
    const parsed = stringAt(raw[key], `${path}.${key}`, diagnostics);
    if (parsed !== undefined) result[key] = parsed;
  }
  return result;
}
function ownershipAt(value: unknown, path: string, diagnostics: ContractDiagnostic[]): ProjectFieldOwnership | undefined {
  if (value === undefined) return undefined;
  if (value === "core" || value === "extension" || value === "external" || value === "derived") return value;
  diagnostics.push(diag("unsupported_policy_value", `${path} must be core, extension, external, or derived`, path));
  return undefined;
}

export function loadProjectPolicy(source: string): PolicyResult<ProjectPolicy> {
  const document = parseDocument(source, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length > 0) return { ok: false, diagnostics: document.errors.map((error) => diag("malformed_policy_yaml", error.message, "$")) };

  const diagnostics: ContractDiagnostic[] = [];
  const root = objectAt(document.toJS(), "$", diagnostics);
  if (!root) return { ok: false, diagnostics };
  if (root.version !== 1) diagnostics.push(diag("unsupported_policy_version", "version must be exactly 1", "version"));

  const projectRaw = objectAt(root.project, "project", diagnostics);
  const contractRaw = objectAt(root.contract, "contract", diagnostics);
  const fieldsRaw = objectAt(root.fields, "fields", diagnostics);
  const owner = projectRaw ? stringAt(projectRaw.owner, "project.owner", diagnostics) : undefined;
  const repository = projectRaw ? stringAt(projectRaw.repository, "project.repository", diagnostics) : undefined;
  const name = projectRaw ? stringAt(projectRaw.name, "project.name", diagnostics) : undefined;
  const marker = contractRaw ? stringAt(contractRaw.marker, "contract.marker", diagnostics) : undefined;
  if (contractRaw?.schema !== 1) diagnostics.push(diag("unsupported_contract_schema", "contract.schema must be exactly 1", "contract.schema"));

  const fields: ProjectPolicy["fields"] = {};
  if (fieldsRaw) {
    const supported = new Set([...CONTRACT_FIELDS, "status"]);
    for (const key of Object.keys(fieldsRaw).sort()) {
      if (!supported.has(key as ContractField | "status")) {
        diagnostics.push(diag("unknown_policy_field", `unsupported policy field: ${key}`, `fields.${key}`));
        continue;
      }
      const raw = objectAt(fieldsRaw[key], `fields.${key}`, diagnostics);
      if (!raw) continue;
      const projectField = stringAt(raw.project_field, `fields.${key}.project_field`, diagnostics);
      const declaredType = raw.type === undefined ? "string" : raw.type;
      if (declaredType !== "string" && declaredType !== "number") diagnostics.push(diag("unsupported_policy_value", `fields.${key}.type must be string or number`, `fields.${key}.type`));
      const ownership = ownershipAt(raw.ownership, `fields.${key}.ownership`, diagnostics);
      const derived = booleanAt(raw.derived, `fields.${key}.derived`, diagnostics, false);
      if (derived && ownership && ownership !== "derived") diagnostics.push(diag("conflicting_field_ownership", `fields.${key} cannot combine derived: true with ownership: ${ownership}`, `fields.${key}`));
      if (projectField) fields[key as ContractField | "status"] = {
        projectField,
        required: booleanAt(raw.required, `fields.${key}.required`, diagnostics, false),
        type: declaredType === "number" ? "number" : "string",
        derived,
        ...(ownership ? { ownership } : {}),
        values: stringMap(raw.values, `fields.${key}.values`, diagnostics),
      };
    }
  }

  const defaultsRaw = root.defaults === undefined ? {} : objectAt(root.defaults, "defaults", diagnostics) ?? {};
  const execution = defaultsRaw.execution;
  if (execution !== undefined && execution !== "agent" && execution !== "human" && execution !== "hybrid") diagnostics.push(diag("unsupported_policy_value", "defaults.execution must be agent, human, or hybrid", "defaults.execution"));
  const workflowRaw = root.workflow === undefined ? {} : objectAt(root.workflow, "workflow", diagnostics) ?? {};
  const schedulingRaw = root.scheduling === undefined ? {} : objectAt(root.scheduling, "scheduling", diagnostics) ?? {};
  const safetyRaw = root.safety === undefined ? {} : objectAt(root.safety, "safety", diagnostics) ?? {};
  const milestones = stringMap(root.milestones, "milestones", diagnostics);

  if (diagnostics.length > 0 || !owner || !repository || !name || !marker) return { ok: false, diagnostics };
  return {
    ok: true,
    value: {
      version: 1,
      project: { owner, repository, name },
      contract: { marker, schema: 1 },
      fields,
      milestones,
      defaults: execution === "agent" || execution === "human" || execution === "hybrid" ? { execution } : {},
      workflow: {
        backlog: optionalString(workflowRaw.backlog_status, "workflow.backlog_status", diagnostics, "Backlog"),
        ready: optionalString(workflowRaw.ready_status, "workflow.ready_status", diagnostics, "Ready"),
        inProgress: optionalString(workflowRaw.in_progress_status, "workflow.in_progress_status", diagnostics, "In Progress"),
        review: optionalString(workflowRaw.review_status, "workflow.review_status", diagnostics, "Review"),
        blocked: optionalString(workflowRaw.blocked_status, "workflow.blocked_status", diagnostics, "Blocked"),
        done: optionalString(workflowRaw.done_status, "workflow.done_status", diagnostics, "Done"),
      },
      scheduling: { automaticIteration: booleanAt(schedulingRaw.automatic_iteration, "scheduling.automatic_iteration", diagnostics, false) },
      safety: {
        overwriteHumanValues: booleanAt(safetyRaw.overwrite_human_values, "safety.overwrite_human_values", diagnostics, false),
        failOnUnknownValues: booleanAt(safetyRaw.fail_on_unknown_values, "safety.fail_on_unknown_values", diagnostics, true),
        commentOnValidationError: booleanAt(safetyRaw.comment_on_validation_error, "safety.comment_on_validation_error", diagnostics, true),
      },
    },
  };
}

function contractValue(contract: IssueContract, field: ContractField): string | number | undefined {
  switch (field) {
    case "kind": return contract.kind;
    case "area": return contract.area;
    case "priority": return contract.priority;
    case "size": return contract.size;
    case "estimate": return contract.estimate;
    case "iteration": return contract.iteration;
  }
}

export function buildDesiredProjectState(contract: IssueContract, policy: ProjectPolicy): PolicyResult<DesiredProjectState> {
  const diagnostics: ContractDiagnostic[] = [];
  const fields: Record<string, string | number> = {};
  const effective = buildEffectiveProjectSchema(policy);
  for (const field of CONTRACT_FIELDS) {
    const effectiveField = effective.fields.find(({ logicalName }) => logicalName === field);
    if (!effectiveField || !isYukhManagedField(effectiveField) || field === "iteration") continue;
    const rule = effectiveField.rule;
    const value = contractValue(contract, field);
    if (value === undefined) {
      if (rule.required) diagnostics.push(diag("missing_policy_required", `${field} is required by repository policy`, field));
      continue;
    }
    if (rule.type === "number") {
      if (typeof value !== "number") diagnostics.push(diag("policy_type_mismatch", `${field} must be numeric`, field));
      else fields[rule.projectField] = value;
      continue;
    }
    if (typeof value !== "string") {
      diagnostics.push(diag("policy_type_mismatch", `${field} must be a string`, field));
      continue;
    }
    const mapped = Object.keys(rule.values).length === 0 ? value : rule.values[value];
    if (mapped === undefined) diagnostics.push(diag("unsupported_contract_value", `${field} value '${value}' is not allowed by repository policy`, field));
    else fields[rule.projectField] = mapped;
  }

  let milestone: string | undefined;
  if (contract.milestone !== undefined) {
    milestone = policy.milestones[contract.milestone];
    if (milestone === undefined) diagnostics.push(diag("unsupported_contract_value", `milestone '${contract.milestone}' is not allowed by repository policy`, "milestone"));
  }
  let iteration: DesiredProjectState["iteration"] = { mode: "none" };
  const iterationField = effective.fields.find(({ logicalName }) => logicalName === "iteration");
  if (iterationField && isYukhManagedField(iterationField)) {
    if (contract.iteration === "auto") {
      if (!policy.scheduling.automaticIteration) diagnostics.push(diag("automatic_iteration_disabled", "iteration auto is disabled by repository policy", "iteration"));
      else iteration = { mode: "auto" };
    } else if (contract.iteration !== undefined) iteration = { mode: "explicit", value: contract.iteration };
  }
  const execution = contract.execution ?? policy.defaults.execution;
  if (!execution) diagnostics.push(diag("missing_policy_required", "execution has no contract value or policy default", "execution"));
  if (diagnostics.length > 0 || !execution) return { ok: false, diagnostics };
  return {
    ok: true,
    value: {
      project: { ...policy.project },
      fields: Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))),
      ...(milestone !== undefined ? { milestone } : {}),
      iteration,
      execution,
      relationships: {
        ...(contract.parent !== undefined ? { parent: contract.parent } : {}),
        children: [...contract.children],
        dependsOn: [...contract.dependsOn],
        blocks: [...contract.blocks],
      },
    },
  };
}
