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
  // In version 1 policies Status was commonly marked derived because it is a
  // GitHub built-in field. Since v0.4 Yukh still governs its workflow options,
  // so legacy `derived: true` must not silently opt Status out of management.
  if (logicalName === "status") return "core";
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
        ownership: rule.ownership ?? defaultFieldOwnership(logicalName, rule),
        rule,
      }];
    })
    .sort((a, b) => a.projectField.localeCompare(b.projectField) || a.logicalName.localeCompare(b.logicalName));
  return { fields };
}

export function isYukhManagedField(field: EffectiveProjectField): boolean {
  return field.ownership === "core" || field.ownership === "extension";
}
