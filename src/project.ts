import type { ContractDiagnostic } from "./contract.js";
import type { ObservedProjectState } from "./report.js";

export interface GraphqlTransport {
  execute<T>(query: string, variables: Record<string, unknown>): Promise<T>;
}

export interface ProjectIdentity {
  id: string;
  number: number;
  title: string;
  owner: string;
}

export interface ProjectFieldOption {
  id: string;
  name: string;
}

export interface ProjectIteration {
  id: string;
  title: string;
  startDate: string;
  duration: number;
}

export interface ProjectFieldDefinition {
  id: string;
  name: string;
  dataType: string;
  options: ProjectFieldOption[];
  iterations: ProjectIteration[];
}

export interface DiscoveredProjectState {
  project: ProjectIdentity;
  fields: ProjectFieldDefinition[];
  issueItem: {
    present: boolean;
    id?: string;
    values: Record<string, string | number>;
    iteration?: string;
  };
  observed: ObservedProjectState;
}

export type ProjectDiscoveryResult =
  | { ok: true; value: DiscoveredProjectState }
  | { ok: false; diagnostics: ContractDiagnostic[] };

export interface DiscoverProjectInput {
  owner: string;
  projectNumber: number;
  repository: string;
  issueNumber: number;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface ProjectNode {
  id: string;
  number: number;
  title: string;
  fields: {
    nodes: Array<
      | {
          __typename: "ProjectV2Field";
          id: string;
          name: string;
          dataType: string;
        }
      | {
          __typename: "ProjectV2SingleSelectField";
          id: string;
          name: string;
          dataType: string;
          options: Array<{ id: string; name: string }>;
        }
      | {
          __typename: "ProjectV2IterationField";
          id: string;
          name: string;
          dataType: string;
          configuration: {
            iterations: Array<{
              id: string;
              title: string;
              startDate: string;
              duration: number;
            }>;
            completedIterations: Array<{
              id: string;
              title: string;
              startDate: string;
              duration: number;
            }>;
          };
        }
      | null
    >;
    pageInfo: PageInfo;
  };
  items: {
    nodes: Array<{
      id: string;
      content: null | {
        __typename: string;
        number?: number;
        repository?: { nameWithOwner: string };
      };
      fieldValues: {
        nodes: Array<
          | { __typename: "ProjectV2ItemFieldTextValue"; text: string; field?: { name: string } }
          | { __typename: "ProjectV2ItemFieldNumberValue"; number: number; field?: { name: string } }
          | { __typename: "ProjectV2ItemFieldSingleSelectValue"; name: string; field?: { name: string } }
          | { __typename: "ProjectV2ItemFieldIterationValue"; title: string; field?: { name: string } }
          | { __typename: string; field?: { name: string } }
          | null
        >;
        pageInfo: PageInfo;
      };
    } | null>;
    pageInfo: PageInfo;
  };
}

interface ProjectResponse {
  organization?: { projectV2: ProjectNode | null } | null;
  user?: { projectV2: ProjectNode | null } | null;
}

const PROJECT_QUERY = `
query DiscoverProject($owner: String!, $number: Int!, $fieldsCursor: String, $itemsCursor: String) {
  organization(login: $owner) {
    projectV2(number: $number) {
      ...ProjectData
    }
  }
  user(login: $owner) {
    projectV2(number: $number) {
      ...ProjectData
    }
  }
}
fragment ProjectData on ProjectV2 {
  id
  number
  title
  fields(first: 50, after: $fieldsCursor) {
    nodes {
      __typename
      ... on ProjectV2Field { id name dataType }
      ... on ProjectV2SingleSelectField { id name dataType options { id name } }
      ... on ProjectV2IterationField {
        id name dataType
        configuration {
          iterations { id title startDate duration }
          completedIterations { id title startDate duration }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
  items(first: 50, after: $itemsCursor) {
    nodes {
      id
      content {
        __typename
        ... on Issue { number repository { nameWithOwner } }
      }
      fieldValues(first: 50) {
        nodes {
          __typename
          ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
          ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { name } } }
          ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
          ... on ProjectV2ItemFieldIterationValue { title field { ... on ProjectV2FieldCommon { name } } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`;

function diagnostic(code: string, message: string, path: string): ContractDiagnostic {
  return { code, message, path };
}

function normalizeError(error: unknown): ContractDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("resource not accessible") || lower.includes("forbidden") || lower.includes("permission")) {
    return diagnostic(
      "project_permission_denied",
      "GitHub denied access to the configured Project; verify project read permissions and token scopes",
      "project",
    );
  }
  return diagnostic("project_api_error", `GitHub Project query failed: ${message}`, "project");
}

function normalizeFields(nodes: ProjectNode["fields"]["nodes"]): ProjectFieldDefinition[] {
  const fields: ProjectFieldDefinition[] = [];
  for (const node of nodes) {
    if (!node) continue;
    const options = node.__typename === "ProjectV2SingleSelectField"
      ? [...node.options].sort((a, b) => a.name.localeCompare(b.name))
      : [];
    const iterations = node.__typename === "ProjectV2IterationField"
      ? [...node.configuration.iterations, ...node.configuration.completedIterations]
          .filter((iteration, index, all) => all.findIndex(({ id }) => id === iteration.id) === index)
          .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title))
      : [];
    fields.push({ id: node.id, name: node.name, dataType: node.dataType, options, iterations });
  }
  return fields.sort((a, b) => a.name.localeCompare(b.name));
}

function fieldValue(value: NonNullable<NonNullable<ProjectNode["items"]["nodes"][number]>["fieldValues"]["nodes"][number]>): string | number | undefined {
  switch (value.__typename) {
    case "ProjectV2ItemFieldTextValue": return value.text;
    case "ProjectV2ItemFieldNumberValue": return value.number;
    case "ProjectV2ItemFieldSingleSelectValue": return value.name;
    case "ProjectV2ItemFieldIterationValue": return value.title;
    default: return undefined;
  }
}

function normalizeIssueItem(
  items: Array<NonNullable<ProjectNode["items"]["nodes"][number]>>,
  repository: string,
  issueNumber: number,
): DiscoveredProjectState["issueItem"] {
  const expectedRepository = repository.toLowerCase();
  const item = items.find(({ content }) =>
    content?.__typename === "Issue" &&
    content.number === issueNumber &&
    content.repository?.nameWithOwner.toLowerCase() === expectedRepository,
  );
  if (!item) return { present: false, values: {} };

  const values: Record<string, string | number> = {};
  let iteration: string | undefined;
  for (const node of item.fieldValues.nodes) {
    if (!node?.field?.name) continue;
    const normalized = fieldValue(node);
    if (normalized === undefined) continue;
    values[node.field.name] = normalized;
    if (node.__typename === "ProjectV2ItemFieldIterationValue") iteration = node.title;
  }
  return {
    present: true,
    id: item.id,
    values: Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))),
    ...(iteration !== undefined ? { iteration } : {}),
  };
}

export class ReadOnlyProjectAdapter {
  constructor(private readonly transport: GraphqlTransport) {}

  async discover(input: DiscoverProjectInput): Promise<ProjectDiscoveryResult> {
    if (!input.owner.trim() || !input.repository.includes("/") || !Number.isInteger(input.projectNumber) || input.projectNumber <= 0 || !Number.isInteger(input.issueNumber) || input.issueNumber <= 0) {
      return {
        ok: false,
        diagnostics: [diagnostic("invalid_project_input", "owner, owner/repository, positive project number and positive issue number are required", "project")],
      };
    }

    const fieldNodes: ProjectNode["fields"]["nodes"] = [];
    const itemNodes: Array<NonNullable<ProjectNode["items"]["nodes"][number]>> = [];
    let fieldsCursor: string | null = null;
    let itemsCursor: string | null = null;
    let project: ProjectNode | null = null;

    try {
      do {
        const response = await this.transport.execute<ProjectResponse>(PROJECT_QUERY, {
          owner: input.owner,
          number: input.projectNumber,
          fieldsCursor,
          itemsCursor,
        });
        const pageProject = response.organization?.projectV2 ?? response.user?.projectV2 ?? null;
        if (!pageProject) {
          return {
            ok: false,
            diagnostics: [diagnostic("project_not_found", `Project #${input.projectNumber} was not found for '${input.owner}'`, "project")],
          };
        }
        project ??= pageProject;
        fieldNodes.push(...pageProject.fields.nodes);
        itemNodes.push(...pageProject.items.nodes.filter((item): item is NonNullable<typeof item> => item !== null));
        fieldsCursor = pageProject.fields.pageInfo.hasNextPage ? pageProject.fields.pageInfo.endCursor : null;
        itemsCursor = pageProject.items.pageInfo.hasNextPage ? pageProject.items.pageInfo.endCursor : null;
      } while (fieldsCursor !== null || itemsCursor !== null);
    } catch (error) {
      return { ok: false, diagnostics: [normalizeError(error)] };
    }

    if (!project) {
      return { ok: false, diagnostics: [diagnostic("project_not_found", "configured Project could not be resolved", "project")] };
    }

    const issueItem = normalizeIssueItem(itemNodes, input.repository, input.issueNumber);
    return {
      ok: true,
      value: {
        project: { id: project.id, number: project.number, title: project.title, owner: input.owner },
        fields: normalizeFields(fieldNodes),
        issueItem,
        observed: {
          projectItemPresent: issueItem.present,
          fields: { ...issueItem.values },
          ...(issueItem.iteration !== undefined ? { iteration: issueItem.iteration } : {}),
          relationships: { children: [], dependsOn: [], blocks: [] },
        },
      },
    };
  }
}
