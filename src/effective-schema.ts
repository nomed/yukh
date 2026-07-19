import type { ProjectPolicy, PolicyField } from "./policy.js";

export type ProjectFieldOwnership = "core" | "extension" | "external" | "derived";

export interface EffectiveProjectField {
  logicalName: string;
  projectField: string;
  ownership: ProjectFieldOwnership;
  rule: PolicyField;
}

export interface EffectiveProjectSchema {
  fields: EffectiveProjectField[];
}

const CORE_FIELDS = new Set(["kind", "priority", "size", "estimate", "status", "iteration"]);

export function defaultFieldOwnership(logicalName: string, rule: PolicyField): ProjectFieldOwnership {
  if (rule.derived) return "derived";
  if (logicalName === "area") return "extension";
  if (CORE_FIELDS.has(logicalName)) return "core";
  return "extension";
}

export function buildEffectiveProjectSchema(policy: ProjectPolicy): EffectiveProjectSchema {
  const fields = Object.entries(policy.fields)
    .flatMap(([logicalName, rule]): EffectiveProjectField[] => {
      if (!rule) return [];
      return [{
        logicalName,
        projectField: rule.projectField,
        ownership: defaultFieldOwnership(logicalName, rule),
        rule,
      }];
    })
    .sort((a, b) => a.projectField.localeCompare(b.projectField) || a.logicalName.localeCompare(b.logicalName));
  return { fields };
}

export function isYukhManagedField(field: EffectiveProjectField): boolean {
  return field.ownership === "core" || field.ownership === "extension";
}
