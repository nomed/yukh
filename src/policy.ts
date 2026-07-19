import { parseDocument } from "yaml";
import type { ContractDiagnostic, IssueContract } from "./contract.js";

const CONTRACT_FIELDS = ["kind", "area", "priority", "size", "estimate", "iteration"] as const;
type ContractField = (typeof CONTRACT_FIELDS)[number];
export type FieldOwnership = "core" | "extension" | "derived";

export interface PolicyField {
  projectField: string;
  required: boolean;
  type: "string" | "number";
  derived: boolean;
  values: Record<string, string>;
  ownership: FieldOwnership;
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
  bootstrap: {
    coreEnabled: boolean;
    extensionFields: Partial<Record<ContractField, PolicyField>>;
  };
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

export const CANONICAL_CORE_FIELDS: Readonly<Partial<Record<ContractField | "status", PolicyField>>> = {
  kind: {
    projectField: "Work Type",
    required: true,
    type: "string",
    derived: false,
    ownership: "core",
    values: {
      gate: "Gate",
      epic: "Epic",
      feature: "Feature",
      task: "Task",
      bug: "Bug",
      technical_debt: "Technical Debt",
    },
  },
  priority: {
    projectField: "Work Priority",
    required: true,
    type: "string",
    derived: false,
    ownership: "core",
    values: { P0: "P0", P1: "P1", P2: "P2", P3: "P3" },
  },
  size: {
    projectField: "Size",
    required: false,
    type: "string",
    derived: false,
    ownership: "core",
    values: { XS: "XS", S: "S", M: "M", L: "L", XL: "XL" },
  },
  estimate: {
    projectField: "Estimate",
    required: false,
    type: "number",
    derived: false,
    ownership: "core",
    values: {},
  },
  iteration: {
    projectField: "Iteration",
    required: false,
    type: "string",
    derived: true,
    ownership: "derived",
    values: {},
  },
  status: {
    projectField: "Status",
    required: false,
    type: "string",
    derived: true,
    ownership: "core",
    values: {},
  },
};

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
function cloneField(field: PolicyField): PolicyField {
  return { ...field, values: { ...field.values } };
}
function parseField(
  key: ContractField | "status",
  value: unknown,
  path: string,
  ownership: FieldOwnership,
  diagnostics: ContractDiagnostic[],
): PolicyField | undefined {
  const raw = objectAt(value, path, diagnostics);
  if (!raw) return undefined;
  const projectField = stringAt(raw.project_field, `${path}.project_field`, diagnostics);
  const declaredType = raw.type === undefined ? "string" : raw.type;
  if (declaredType !== "string" && declaredType !== "number") diagnostics.push(diag("unsupported_policy_value", `${path}.type must be string or number`, `${path}.type`));
  if (!projectField) return undefined;
  return {
    projectField,
    required: booleanAt(raw.required, `${path}.required`, diagnostics, false),
    type: declaredType === "number" ? "number" : "string",
    derived: booleanAt(raw.derived, `${path}.derived`, diagnostics, key === "iteration" || key === "status"),
    values: stringMap(raw.values, `${path}.values`, diagnostics),
    ownership,
  };
}
function mergeCoreField(base: PolicyField, override: PolicyField): PolicyField {
  return {
    ...override,
    ownership: base.ownership,
    values: { ...base.values, ...override.values },
  };
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

  const bootstrapRaw = root.bootstrap === undefined ? {} : objectAt(root.bootstrap, "bootstrap", diagnostics) ?? {};
  const coreRaw = bootstrapRaw.core === undefined ? {} : objectAt(bootstrapRaw.core, "bootstrap.core", diagnostics) ?? {};
  const coreEnabled = booleanAt(coreRaw.enabled, "bootstrap.core.enabled", diagnostics, false);
  const fields: ProjectPolicy["fields"] = {};
  if (coreEnabled) {
    for (const [key, value] of Object.entries(CANONICAL_CORE_FIELDS)) {
      if (value) fields[key as ContractField | "status"] = cloneField(value);
    }
  }

  if (fieldsRaw) {
    const supported = new Set([...CONTRACT_FIELDS, "status"]);
    for (const key of Object.keys(fieldsRaw).sort()) {
      if (!supported.has(key as ContractField | "status")) {
        diagnostics.push(diag("unknown_policy_field", `unsupported policy field: ${key}`, `fields.${key}`));
        continue;
      }
      const typedKey = key as ContractField | "status";
      const ownership: FieldOwnership = typedKey === "area" ? "extension" : typedKey === "iteration" ? "derived" : "core";
      const parsed = parseField(typedKey, fieldsRaw[key], `fields.${key}`, ownership, diagnostics);
      if (!parsed) continue;
      const canonical = fields[typedKey];
      fields[typedKey] = canonical ? mergeCoreField(canonical, parsed) : parsed;
    }
  }

  const extensionsRaw = bootstrapRaw.extensions === undefined ? {} : objectAt(bootstrapRaw.extensions, "bootstrap.extensions", diagnostics) ?? {};
  const extensionFieldsRaw = extensionsRaw.fields === undefined ? {} : objectAt(extensionsRaw.fields, "bootstrap.extensions.fields", diagnostics) ?? {};
  const extensionFields: ProjectPolicy["bootstrap"]["extensionFields"] = {};
  const coreKeys = new Set(["kind", "priority", "size", "estimate", "iteration"]);
  for (const key of Object.keys(extensionFieldsRaw).sort()) {
    if (!CONTRACT_FIELDS.includes(key as ContractField)) {
      diagnostics.push(diag("unknown_extension_field", `unsupported extension field: ${key}`, `bootstrap.extensions.fields.${key}`));
      continue;
    }
    if (coreKeys.has(key)) {
      diagnostics.push(diag("core_field_cannot_be_extension", `${key} is part of Yukh's canonical core schema and cannot be redeclared as an extension`, `bootstrap.extensions.fields.${key}`));
      continue;
    }
    const typedKey = key as ContractField;
    const parsed = parseField(typedKey, extensionFieldsRaw[key], `bootstrap.extensions.fields.${key}`, "extension", diagnostics);
    if (!parsed) continue;
    extensionFields[typedKey] = parsed;
    fields[typedKey] = parsed;
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
      bootstrap: { coreEnabled, extensionFields },
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
  for (const field of CONTRACT_FIELDS) {
    const rule = policy.fields[field];
    if (!rule || rule.derived || field === "iteration") continue;
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
  if (contract.iteration === "auto") {
    if (!policy.scheduling.automaticIteration) diagnostics.push(diag("automatic_iteration_disabled", "iteration auto is disabled by repository policy", "iteration"));
    else iteration = { mode: "auto" };
  } else if (contract.iteration !== undefined) iteration = { mode: "explicit", value: contract.iteration };
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
