import type { ContractDiagnostic } from "./contract.js";
import type { GraphqlTransport } from "./project.js";
import { loadProjectPolicy, type ProjectPolicy } from "./policy.js";

export type BootstrapMode = "dry-run" | "apply";
export type BootstrapFieldType = "SINGLE_SELECT" | "NUMBER";

export interface BootstrapOption {
  id?: string;
  name: string;
  color: string;
  description: string;
}

export interface BootstrapFieldSpec {
  name: string;
  dataType: BootstrapFieldType;
  options: BootstrapOption[];
}

export interface ExistingBootstrapField {
  id: string;
  name: string;
  dataType: string;
  options: BootstrapOption[];
}

export type BootstrapOperation =
  | { kind: "create-field"; field: BootstrapFieldSpec }
  | { kind: "update-options"; field: BootstrapFieldSpec; fieldId: string; options: BootstrapOption[]; missing: string[]; preserved: string[] };

export interface BootstrapPlan {
  operations: BootstrapOperation[];
  unchanged: string[];
}

export interface BootstrapOutcome {
  ok: boolean;
  mode: BootstrapMode;
  project: { id: string; title: string; owner: string; number: number } | null;
  plan: BootstrapPlan;
  applied: number;
  remaining: BootstrapOperation[];
  diagnostics: ContractDiagnostic[];
  human: string;
  json: string;
  summary: string;
}

interface RawProjectField {
  __typename: string;
  id?: string;
  name?: string;
  dataType?: string;
  options?: Array<{ id?: string; name?: string; color?: string; description?: string | null }>;
}

interface RawProjectResponse {
  repositoryOwner?: {
    projectV2?: {
      id: string;
      title: string;
      fields: { nodes: Array<RawProjectField | null> };
    } | null;
  } | null;
}

const DISCOVER_PROJECT = `
query BootstrapProject($owner: String!, $number: Int!) {
  repositoryOwner(login: $owner) {
    ... on ProjectV2Owner {
      projectV2(number: $number) {
        id title
        fields(first: 100) {
          nodes {
            __typename
            ... on ProjectV2FieldCommon { id name dataType }
            ... on ProjectV2SingleSelectField { options { id name color description } }
          }
        }
      }
    }
  }
}`;

const CREATE_FIELD = `
mutation CreateBootstrapField($projectId: ID!, $name: String!, $dataType: ProjectV2CustomFieldType!, $options: [ProjectV2SingleSelectFieldOptionInput!]) {
  createProjectV2Field(input: { projectId: $projectId, name: $name, dataType: $dataType, singleSelectOptions: $options }) {
    projectV2Field { ... on ProjectV2FieldCommon { id name dataType } }
  }
}`;

const UPDATE_OPTIONS = `
mutation UpdateBootstrapOptions($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
  updateProjectV2Field(input: { fieldId: $fieldId, singleSelectOptions: $options }) {
    projectV2Field { ... on ProjectV2SingleSelectField { id name } }
  }
}`;

function diagnostic(code: string, message: string, path: string): ContractDiagnostic {
  return { code, message, path };
}

function stableColor(index: number): string {
  const colors = ["GRAY", "BLUE", "GREEN", "YELLOW", "ORANGE", "RED", "PURPLE", "PINK"];
  return colors[index % colors.length] ?? "GRAY";
}

export function desiredProjectSchema(policy: ProjectPolicy): { fields: BootstrapFieldSpec[]; diagnostics: ContractDiagnostic[] } {
  const diagnostics: ContractDiagnostic[] = [];
  const byName = new Map<string, BootstrapFieldSpec>();

  for (const [logicalName, rule] of Object.entries(policy.fields).sort(([a], [b]) => a.localeCompare(b))) {
    if (!rule || rule.derived || logicalName === "status" || logicalName === "iteration") continue;

    let spec: BootstrapFieldSpec;
    if (rule.type === "number") {
      spec = { name: rule.projectField, dataType: "NUMBER", options: [] };
    } else if (Object.keys(rule.values).length > 0) {
      const names = [...new Set(Object.values(rule.values))].sort((a, b) => a.localeCompare(b));
      spec = {
        name: rule.projectField,
        dataType: "SINGLE_SELECT",
        options: names.map((name, index) => ({ name, color: stableColor(index), description: "" })),
      };
    } else {
      diagnostics.push(diagnostic(
        "unsupported_bootstrap_field",
        `Policy field '${logicalName}' maps to '${rule.projectField}' without enum values or numeric type; Yukh cannot infer a safe Project field type`,
        `fields.${logicalName}`,
      ));
      continue;
    }

    const key = spec.name.toLowerCase();
    const existing = byName.get(key);
    if (existing && existing.dataType !== spec.dataType) {
      diagnostics.push(diagnostic("conflicting_bootstrap_mapping", `Multiple policy rules map '${spec.name}' to incompatible field types`, `fields.${logicalName}`));
      continue;
    }
    if (existing?.dataType === "SINGLE_SELECT") {
      const mergedNames = [...new Set([...existing.options.map(({ name }) => name), ...spec.options.map(({ name }) => name)])].sort();
      existing.options = mergedNames.map((name, index) => ({ name, color: stableColor(index), description: "" }));
    } else {
      byName.set(key, spec);
    }
  }

  return { fields: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)), diagnostics };
}

export function mergeBootstrapOptions(existing: BootstrapOption[], desired: BootstrapOption[]): {
  changed: boolean;
  options: BootstrapOption[];
  missing: string[];
  preserved: string[];
} {
  const remaining = new Map(existing.map((option) => [option.name.toLowerCase(), option]));
  const options: BootstrapOption[] = [];
  const missing: string[] = [];

  for (const desiredOption of desired) {
    const found = remaining.get(desiredOption.name.toLowerCase());
    if (found) {
      options.push({
        ...(found.id !== undefined ? { id: found.id } : {}),
        name: found.name,
        color: found.color || desiredOption.color,
        description: found.description,
      });
      remaining.delete(desiredOption.name.toLowerCase());
    } else {
      options.push({ ...desiredOption });
      missing.push(desiredOption.name);
    }
  }

  const preservedOptions = [...remaining.values()].sort((a, b) => a.name.localeCompare(b.name));
  options.push(...preservedOptions);
  return { changed: missing.length > 0, options, missing, preserved: preservedOptions.map(({ name }) => name) };
}

export function planProjectBootstrap(existing: ExistingBootstrapField[], desired: BootstrapFieldSpec[]): {
  ok: boolean;
  plan: BootstrapPlan;
  diagnostics: ContractDiagnostic[];
} {
  const diagnostics: ContractDiagnostic[] = [];
  const operations: BootstrapOperation[] = [];
  const unchanged: string[] = [];
  const byName = new Map(existing.map((field) => [field.name.toLowerCase(), field]));

  for (const field of desired) {
    const current = byName.get(field.name.toLowerCase());
    if (!current) {
      operations.push({ kind: "create-field", field });
      continue;
    }
    if (current.dataType !== field.dataType) {
      diagnostics.push(diagnostic("incompatible_project_field_type", `Project field '${field.name}' has type ${current.dataType}, but policy requires ${field.dataType}`, `fields.${field.name}`));
      continue;
    }
    if (field.dataType === "SINGLE_SELECT") {
      const merged = mergeBootstrapOptions(current.options, field.options);
      if (merged.changed) operations.push({ kind: "update-options", field, fieldId: current.id, options: merged.options, missing: merged.missing, preserved: merged.preserved });
      else unchanged.push(field.name);
    } else unchanged.push(field.name);
  }

  return { ok: diagnostics.length === 0, plan: { operations, unchanged: unchanged.sort() }, diagnostics };
}

function normalizeFields(nodes: Array<RawProjectField | null>): ExistingBootstrapField[] {
  return nodes.flatMap((node): ExistingBootstrapField[] => {
    if (!node?.id || !node.name || !node.dataType) return [];
    const options: BootstrapOption[] = (node.options ?? []).flatMap((option): BootstrapOption[] => {
      if (!option.name) return [];
      return [{
        ...(option.id !== undefined ? { id: option.id } : {}),
        name: option.name,
        color: option.color ?? "GRAY",
        description: option.description ?? "",
      }];
    });
    return [{ id: node.id, name: node.name, dataType: node.dataType, options }];
  });
}

function render(plan: BootstrapPlan): string[] {
  return [
    ...plan.operations.map((operation) => operation.kind === "create-field"
      ? `CREATE ${operation.field.name} (${operation.field.dataType})`
      : `UPDATE ${operation.field.name} add=[${operation.missing.join(", ")}] preserve=[${operation.preserved.join(", ") || "none"}]`),
    ...plan.unchanged.map((name) => `OK ${name}`),
  ];
}

export async function runProjectBootstrap(input: {
  policySource: string;
  projectNumber: number;
  mode?: string;
  applyEnabled?: boolean | string;
  tokenAvailable: boolean;
}, transport: GraphqlTransport): Promise<BootstrapOutcome> {
  const mode: BootstrapMode = input.mode === "apply" ? "apply" : "dry-run";
  const policyResult = loadProjectPolicy(input.policySource);
  const diagnostics: ContractDiagnostic[] = [];
  if (!policyResult.ok) diagnostics.push(...policyResult.diagnostics);
  if (!Number.isInteger(input.projectNumber) || input.projectNumber <= 0) diagnostics.push(diagnostic("invalid_project_number", "project-number must be a positive integer", "project-number"));
  if (!input.tokenAvailable) diagnostics.push(diagnostic("github_token_missing", "Project bootstrap requires a GitHub token", "token"));
  const applyEnabled = input.applyEnabled === true || input.applyEnabled === "true";
  if (mode === "apply" && !applyEnabled) diagnostics.push(diagnostic("apply_not_enabled", "bootstrap apply requires apply-enabled=true", "apply-enabled"));

  const emptyPlan: BootstrapPlan = { operations: [], unchanged: [] };
  if (!policyResult.ok || diagnostics.length > 0) return buildOutcome(mode, null, emptyPlan, 0, [], diagnostics);

  const desired = desiredProjectSchema(policyResult.value);
  diagnostics.push(...desired.diagnostics);
  if (diagnostics.length > 0) return buildOutcome(mode, null, emptyPlan, 0, [], diagnostics);

  let project: NonNullable<BootstrapOutcome["project"]>;
  let fields: ExistingBootstrapField[];
  try {
    const response = await transport.execute<RawProjectResponse>(DISCOVER_PROJECT, { owner: policyResult.value.project.owner, number: input.projectNumber });
    const node = response.repositoryOwner?.projectV2;
    if (!node) return buildOutcome(mode, null, emptyPlan, 0, [], [diagnostic("project_not_found", `Project #${input.projectNumber} was not found for '${policyResult.value.project.owner}'`, "project")]);
    project = { id: node.id, title: node.title, owner: policyResult.value.project.owner, number: input.projectNumber };
    fields = normalizeFields(node.fields.nodes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = /resource not accessible|forbidden|permission/i.test(message) ? "project_permission_denied" : "project_api_error";
    return buildOutcome(mode, null, emptyPlan, 0, [], [diagnostic(code, `Project bootstrap discovery failed: ${message}`, "project")]);
  }

  const planned = planProjectBootstrap(fields, desired.fields);
  if (!planned.ok) return buildOutcome(mode, project, planned.plan, 0, planned.plan.operations, planned.diagnostics);
  if (mode === "dry-run") return buildOutcome(mode, project, planned.plan, 0, planned.plan.operations, []);

  let applied = 0;
  for (let index = 0; index < planned.plan.operations.length; index += 1) {
    const operation = planned.plan.operations[index]!;
    try {
      if (operation.kind === "create-field") {
        await transport.execute<unknown>(CREATE_FIELD, {
          projectId: project.id,
          name: operation.field.name,
          dataType: operation.field.dataType,
          options: operation.field.dataType === "SINGLE_SELECT" ? operation.field.options : null,
        });
      } else {
        await transport.execute<unknown>(UPDATE_OPTIONS, { fieldId: operation.fieldId, options: operation.options });
      }
      applied += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return buildOutcome(mode, project, planned.plan, applied, planned.plan.operations.slice(index), [diagnostic("project_bootstrap_mutation_failed", `Bootstrap mutation failed: ${message}`, `operations.${index}`)]);
    }
  }

  return buildOutcome(mode, project, planned.plan, applied, [], []);
}

function buildOutcome(mode: BootstrapMode, project: BootstrapOutcome["project"], plan: BootstrapPlan, applied: number, remaining: BootstrapOperation[], diagnostics: ContractDiagnostic[]): BootstrapOutcome {
  const ok = diagnostics.length === 0 && (mode === "dry-run" || remaining.length === 0);
  const lines = project ? [`Project: ${project.title} (${project.owner}#${project.number})`, ...render(plan)] : [];
  if (mode === "dry-run" && diagnostics.length === 0) lines.push("Dry run only: no changes applied.");
  if (mode === "apply" && diagnostics.length === 0) lines.push(`Applied ${applied} operation(s).`);
  for (const item of diagnostics) lines.push(`ERROR ${item.path}: ${item.message}`);
  const payload = { status: ok ? (mode === "dry-run" ? "dry-run" : "success") : "error", operation: "bootstrap-project", mode, applied, remaining, diagnostics };
  const summary = [
    "# Yukh Project bootstrap", "",
    `**Mode:** ${mode}`,
    `**Project:** ${project ? `${project.owner}#${project.number} — ${project.title}` : "unresolved"}`,
    `**Planned operations:** ${plan.operations.length}`,
    `**Applied operations:** ${applied}`,
    `**Remaining operations:** ${remaining.length}`,
    `**Status:** ${payload.status}`,
    ...(diagnostics.length ? ["", "## Diagnostics", ...diagnostics.map(({ code, path, message }) => `- \`${path}\` — ${message} (\`${code}\`)`)] : []),
  ].join("\n") + "\n";
  return { ok, mode, project, plan, applied, remaining, diagnostics, human: lines.join("\n"), json: `${JSON.stringify(payload, null, 2)}\n`, summary };
}
