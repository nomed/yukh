import { parseDocument } from "yaml";

const OPENING_MARKER = "<!-- yukh";
const CLOSING_MARKER = "-->";

const KNOWN_KEYS = new Set([
  "schema",
  "kind",
  "area",
  "priority",
  "milestone",
  "parent",
  "children",
  "depends_on",
  "blocks",
  "size",
  "estimate",
  "iteration",
  "execution",
  "owner",
]);

export type ExecutionMode = "agent" | "human" | "hybrid";

export interface IssueContract {
  schema: 1;
  kind: string;
  area: string;
  priority: string;
  milestone?: string;
  parent?: number;
  children: number[];
  dependsOn: number[];
  blocks: number[];
  size?: string;
  estimate?: number;
  iteration?: string;
  execution?: ExecutionMode;
  owner?: string;
  extensions: Record<string, unknown>;
}

export interface ContractDiagnostic {
  code: string;
  message: string;
  path: string;
}

export type ContractParseResult =
  | { ok: true; contract: IssueContract }
  | { ok: false; diagnostics: ContractDiagnostic[] };

export interface ParseContractOptions {
  issueNumber?: number;
  artifact?: string;
}

function diagnostic(
  code: string,
  message: string,
  path: string,
): ContractDiagnostic {
  return { code, message, path };
}

function findContractBlocks(body: string): string[] {
  const blocks: string[] = [];
  let offset = 0;

  while (offset < body.length) {
    const start = body.indexOf(OPENING_MARKER, offset);
    if (start === -1) break;

    const contentStart = start + OPENING_MARKER.length;
    const end = body.indexOf(CLOSING_MARKER, contentStart);
    if (end === -1) {
      blocks.push(body.slice(contentStart));
      break;
    }

    blocks.push(body.slice(contentStart, end));
    offset = end + CLOSING_MARKER.length;
  }

  return blocks;
}

function asNonEmptyString(
  value: unknown,
  key: string,
  diagnostics: ContractDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    diagnostics.push(
      diagnostic("invalid_type", `${key} must be a non-empty string`, key),
    );
    return undefined;
  }
  return value.trim();
}

function asPositiveInteger(
  value: unknown,
  key: string,
  diagnostics: ContractDiagnostic[],
): number | undefined {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    diagnostics.push(
      diagnostic("invalid_type", `${key} must be a positive integer`, key),
    );
    return undefined;
  }
  return value as number;
}

function asIssueList(
  value: unknown,
  key: string,
  diagnostics: ContractDiagnostic[],
): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic("invalid_type", `${key} must be an array of issue numbers`, key),
    );
    return [];
  }

  const result: number[] = [];
  value.forEach((entry, index) => {
    const parsed = asPositiveInteger(entry, `${key}[${index}]`, diagnostics);
    if (parsed !== undefined) result.push(parsed);
  });

  return [...new Set(result)].sort((a, b) => a - b);
}

export function parseIssueContract(
  body: string | null | undefined,
  options: ParseContractOptions = {},
): ContractParseResult {
  const artifact = options.artifact ?? "issue";
  const diagnostics: ContractDiagnostic[] = [];

  if (!body) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "missing_contract",
          `${artifact} does not contain a Yukh contract`,
          "$",
        ),
      ],
    };
  }

  const blocks = findContractBlocks(body);
  if (blocks.length === 0) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "missing_contract",
          `${artifact} does not contain a Yukh contract`,
          "$",
        ),
      ],
    };
  }
  if (blocks.length > 1) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "duplicate_contract",
          `${artifact} contains more than one Yukh contract`,
          "$",
        ),
      ],
    };
  }
  if (!body.includes(CLOSING_MARKER, body.indexOf(OPENING_MARKER))) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "unterminated_contract",
          `${artifact} contains an unterminated Yukh contract`,
          "$",
        ),
      ],
    };
  }

  const document = parseDocument(blocks[0] ?? "", {
    prettyErrors: false,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    return {
      ok: false,
      diagnostics: document.errors.map((error) =>
        diagnostic("malformed_yaml", error.message, "$"),
      ),
    };
  }

  const raw = document.toJS() as unknown;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic("invalid_contract", "contract root must be a mapping", "$"),
      ],
    };
  }

  const values = raw as Record<string, unknown>;
  for (const key of Object.keys(values)) {
    if (!KNOWN_KEYS.has(key) && !key.startsWith("x-")) {
      diagnostics.push(
        diagnostic("unknown_key", `unknown contract key: ${key}`, key),
      );
    }
  }

  for (const key of ["schema", "kind", "area", "priority"] as const) {
    if (!(key in values)) {
      diagnostics.push(
        diagnostic("missing_required", `${key} is required`, key),
      );
    }
  }

  if (values.schema !== 1) {
    diagnostics.push(
      diagnostic("unsupported_schema", "schema must be exactly 1", "schema"),
    );
  }

  const kind = asNonEmptyString(values.kind, "kind", diagnostics);
  const area = asNonEmptyString(values.area, "area", diagnostics);
  const priority = asNonEmptyString(values.priority, "priority", diagnostics);
  const milestone =
    values.milestone === undefined
      ? undefined
      : asNonEmptyString(values.milestone, "milestone", diagnostics);
  const parent =
    values.parent === undefined
      ? undefined
      : asPositiveInteger(values.parent, "parent", diagnostics);
  const children = asIssueList(values.children, "children", diagnostics);
  const dependsOn = asIssueList(values.depends_on, "depends_on", diagnostics);
  const blocksList = asIssueList(values.blocks, "blocks", diagnostics);
  const size =
    values.size === undefined
      ? undefined
      : asNonEmptyString(values.size, "size", diagnostics);
  const estimate =
    values.estimate === undefined
      ? undefined
      : asPositiveInteger(values.estimate, "estimate", diagnostics);
  const iteration =
    values.iteration === undefined
      ? undefined
      : asNonEmptyString(values.iteration, "iteration", diagnostics);
  const owner =
    values.owner === undefined
      ? undefined
      : asNonEmptyString(values.owner, "owner", diagnostics);

  let execution: ExecutionMode | undefined;
  if (values.execution !== undefined) {
    if (
      values.execution === "agent" ||
      values.execution === "human" ||
      values.execution === "hybrid"
    ) {
      execution = values.execution;
    } else {
      diagnostics.push(
        diagnostic(
          "unsupported_value",
          "execution must be agent, human, or hybrid",
          "execution",
        ),
      );
    }
  }

  if (options.issueNumber !== undefined) {
    const issueNumber = options.issueNumber;
    const references: Array<[string, number | undefined | number[]]> = [
      ["parent", parent],
      ["children", children],
      ["depends_on", dependsOn],
      ["blocks", blocksList],
    ];
    for (const [path, reference] of references) {
      const matches = Array.isArray(reference)
        ? reference.includes(issueNumber)
        : reference === issueNumber;
      if (matches) {
        diagnostics.push(
          diagnostic(
            "self_reference",
            `${path} must not reference issue #${issueNumber}`,
            path,
          ),
        );
      }
    }
  }

  if (diagnostics.length > 0 || !kind || !area || !priority) {
    return { ok: false, diagnostics };
  }

  const extensions = Object.fromEntries(
    Object.entries(values).filter(([key]) => key.startsWith("x-")),
  );

  return {
    ok: true,
    contract: {
      schema: 1,
      kind,
      area,
      priority,
      ...(milestone !== undefined ? { milestone } : {}),
      ...(parent !== undefined ? { parent } : {}),
      children,
      dependsOn,
      blocks: blocksList,
      ...(size !== undefined ? { size } : {}),
      ...(estimate !== undefined ? { estimate } : {}),
      ...(iteration !== undefined ? { iteration } : {}),
      ...(execution !== undefined ? { execution } : {}),
      ...(owner !== undefined ? { owner } : {}),
      extensions,
    },
  };
}
