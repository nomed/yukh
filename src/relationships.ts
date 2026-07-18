import type { ContractDiagnostic } from "./contract.js";

export interface RelationshipState {
  parent?: number;
  children: number[];
  dependsOn: number[];
  blocks: number[];
}

export interface RelationshipGraphNode {
  issueNumber: number;
  desired: Partial<RelationshipState>;
}

export interface RelationshipGraph {
  nodes: RelationshipGraphNode[];
}

export type RelationshipKind = "parent" | "child" | "depends_on" | "blocks";

export interface RelationshipOperation {
  action: "add" | "remove";
  relationship: RelationshipKind;
  issueNumber: number;
}

export interface RelationshipPlan {
  issueNumber: number;
  desired: RelationshipState;
  observed: RelationshipState;
  operations: RelationshipOperation[];
}

export type RelationshipPlanResult =
  | { ok: true; plan: RelationshipPlan }
  | { ok: false; diagnostics: ContractDiagnostic[] };

function diagnostic(code: string, message: string, path: string): ContractDiagnostic {
  return { code, message, path };
}

function stableNumbers(values: readonly number[] | undefined): number[] {
  return [...new Set(values ?? [])].sort((a, b) => a - b);
}

export function normalizeRelationships(
  value: Partial<RelationshipState> | undefined,
): RelationshipState {
  return {
    ...(value?.parent !== undefined ? { parent: value.parent } : {}),
    children: stableNumbers(value?.children),
    dependsOn: stableNumbers(value?.dependsOn),
    blocks: stableNumbers(value?.blocks),
  };
}

function stableDiagnostics(values: ContractDiagnostic[]): ContractDiagnostic[] {
  return values.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
}

function validateReferences(
  issueNumber: number,
  state: RelationshipState,
  existing: ReadonlySet<number>,
  diagnostics: ContractDiagnostic[],
): void {
  const references: Array<[string, number[]]> = [
    ["children", state.children],
    ["dependsOn", state.dependsOn],
    ["blocks", state.blocks],
  ];
  if (state.parent !== undefined) references.unshift(["parent", [state.parent]]);

  for (const [path, numbers] of references) {
    for (const reference of numbers) {
      if (reference === issueNumber) {
        diagnostics.push(
          diagnostic(
            "relationship_self_reference",
            `${path} must not reference issue #${issueNumber}`,
            `relationships.${path}`,
          ),
        );
      } else if (!existing.has(reference)) {
        diagnostics.push(
          diagnostic(
            "relationship_missing_reference",
            `${path} references missing issue #${reference}`,
            `relationships.${path}`,
          ),
        );
      }
    }
  }
}

function detectCycles(
  graph: Map<number, RelationshipState>,
  selectEdges: (state: RelationshipState) => readonly number[],
  code: string,
  path: string,
  diagnostics: ContractDiagnostic[],
): void {
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const stack: number[] = [];
  const reported = new Set<string>();

  const visit = (issue: number): void => {
    if (visited.has(issue)) return;
    if (visiting.has(issue)) {
      const start = stack.indexOf(issue);
      const cycle = [...stack.slice(start), issue];
      const signature = [...new Set(cycle)].sort((a, b) => a - b).join(",");
      if (!reported.has(signature)) {
        reported.add(signature);
        diagnostics.push(
          diagnostic(code, `relationship cycle detected: ${cycle.map((n) => `#${n}`).join(" -> ")}`, path),
        );
      }
      return;
    }

    visiting.add(issue);
    stack.push(issue);
    const state = graph.get(issue);
    if (state) {
      for (const next of selectEdges(state)) {
        if (graph.has(next)) visit(next);
      }
    }
    stack.pop();
    visiting.delete(issue);
    visited.add(issue);
  };

  for (const issue of [...graph.keys()].sort((a, b) => a - b)) visit(issue);
}

function validateReciprocity(
  graph: Map<number, RelationshipState>,
  diagnostics: ContractDiagnostic[],
): void {
  for (const [issue, state] of graph) {
    if (state.parent !== undefined) {
      const parent = graph.get(state.parent);
      if (parent && !parent.children.includes(issue)) {
        diagnostics.push(
          diagnostic(
            "relationship_reciprocal_conflict",
            `issue #${issue} declares parent #${state.parent}, but the parent does not declare child #${issue}`,
            `issues.${issue}.relationships.parent`,
          ),
        );
      }
    }

    for (const child of state.children) {
      const childState = graph.get(child);
      if (childState?.parent !== issue) {
        diagnostics.push(
          diagnostic(
            "relationship_reciprocal_conflict",
            `issue #${issue} declares child #${child}, but that issue does not declare parent #${issue}`,
            `issues.${issue}.relationships.children`,
          ),
        );
      }
    }

    for (const dependency of state.dependsOn) {
      const dependencyState = graph.get(dependency);
      if (dependencyState && !dependencyState.blocks.includes(issue)) {
        diagnostics.push(
          diagnostic(
            "relationship_reciprocal_conflict",
            `issue #${issue} depends on #${dependency}, but #${dependency} does not block #${issue}`,
            `issues.${issue}.relationships.dependsOn`,
          ),
        );
      }
    }

    for (const blocked of state.blocks) {
      const blockedState = graph.get(blocked);
      if (blockedState && !blockedState.dependsOn.includes(issue)) {
        diagnostics.push(
          diagnostic(
            "relationship_reciprocal_conflict",
            `issue #${issue} blocks #${blocked}, but #${blocked} does not depend on #${issue}`,
            `issues.${issue}.relationships.blocks`,
          ),
        );
      }
    }
  }
}

function validateParentAmbiguity(
  graph: Map<number, RelationshipState>,
  diagnostics: ContractDiagnostic[],
): void {
  const declaredParents = new Map<number, number[]>();
  for (const [parent, state] of graph) {
    for (const child of state.children) {
      const parents = declaredParents.get(child) ?? [];
      parents.push(parent);
      declaredParents.set(child, parents);
    }
  }

  for (const [child, parents] of declaredParents) {
    const unique = stableNumbers(parents);
    if (unique.length > 1) {
      diagnostics.push(
        diagnostic(
          "relationship_ambiguous_parent",
          `issue #${child} is declared as a child by multiple parents: ${unique.map((n) => `#${n}`).join(", ")}`,
          `issues.${child}.relationships.parent`,
        ),
      );
    }
  }
}

function operationsFor(
  relationship: Exclude<RelationshipKind, "parent">,
  desired: readonly number[],
  observed: readonly number[],
): RelationshipOperation[] {
  const wanted = new Set(desired);
  const current = new Set(observed);
  const operations: RelationshipOperation[] = [];
  for (const issueNumber of desired) {
    if (!current.has(issueNumber)) operations.push({ action: "add", relationship, issueNumber });
  }
  for (const issueNumber of observed) {
    if (!wanted.has(issueNumber)) operations.push({ action: "remove", relationship, issueNumber });
  }
  return operations;
}

export function buildRelationshipPlan(input: {
  issueNumber: number;
  desired: Partial<RelationshipState>;
  observed?: Partial<RelationshipState>;
  graph: RelationshipGraph;
}): RelationshipPlanResult {
  const diagnostics: ContractDiagnostic[] = [];
  const nodes = new Map<number, RelationshipState>();

  for (const node of input.graph.nodes) {
    if (!Number.isInteger(node.issueNumber) || node.issueNumber <= 0) {
      diagnostics.push(
        diagnostic("invalid_relationship_issue", "graph issue numbers must be positive integers", "graph.nodes"),
      );
      continue;
    }
    if (nodes.has(node.issueNumber)) {
      diagnostics.push(
        diagnostic(
          "duplicate_relationship_issue",
          `issue #${node.issueNumber} appears more than once in the relationship graph`,
          `issues.${node.issueNumber}`,
        ),
      );
      continue;
    }
    nodes.set(node.issueNumber, normalizeRelationships(node.desired));
  }

  const desired = normalizeRelationships(input.desired);
  const observed = normalizeRelationships(input.observed);
  nodes.set(input.issueNumber, desired);
  const existing = new Set(nodes.keys());

  for (const [issue, state] of nodes) validateReferences(issue, state, existing, diagnostics);
  validateParentAmbiguity(nodes, diagnostics);
  validateReciprocity(nodes, diagnostics);
  detectCycles(
    nodes,
    (state) => state.dependsOn,
    "relationship_dependency_cycle",
    "relationships.dependsOn",
    diagnostics,
  );
  detectCycles(
    nodes,
    (state) => (state.parent === undefined ? [] : [state.parent]),
    "relationship_parent_cycle",
    "relationships.parent",
    diagnostics,
  );

  if (diagnostics.length > 0) return { ok: false, diagnostics: stableDiagnostics(diagnostics) };

  const operations: RelationshipOperation[] = [];
  if (desired.parent !== observed.parent) {
    if (observed.parent !== undefined) {
      operations.push({ action: "remove", relationship: "parent", issueNumber: observed.parent });
    }
    if (desired.parent !== undefined) {
      operations.push({ action: "add", relationship: "parent", issueNumber: desired.parent });
    }
  }
  operations.push(...operationsFor("child", desired.children, observed.children));
  operations.push(...operationsFor("depends_on", desired.dependsOn, observed.dependsOn));
  operations.push(...operationsFor("blocks", desired.blocks, observed.blocks));

  operations.sort(
    (left, right) =>
      left.relationship.localeCompare(right.relationship) ||
      left.issueNumber - right.issueNumber ||
      left.action.localeCompare(right.action),
  );

  return {
    ok: true,
    plan: { issueNumber: input.issueNumber, desired, observed, operations },
  };
}
