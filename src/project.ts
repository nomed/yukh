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

interface RawField {
  __typename: string;
  id: string;
  name: string;
  dataType: string;
  options?: ProjectFieldOption[];
  configuration?: {
    iterations?: ProjectIteration[];
    completedIterations?: ProjectIteration[];
  };
}

interface RawFieldValue {
  __typename: string;
  text?: string;
  number?: number;
  name?: string;
  title?: string;
  date?: string;
  field?: { name?: string } | null;
}

interface RawItem {
  id: string;
  content: null | {
    __typename: string;
    number?: number;
    repository?: { nameWithOwner?: string } | null;
  };
  fieldValues: {
    nodes: Array<RawFieldValue | null>;
    pageInfo: PageInfo;
  };
}

interface ProjectNode {
  id: string;
  number: number;
  title: string;
  fields: { nodes: Array<RawField | null>; pageInfo: PageInfo };
  items: { nodes: Array<RawItem | null>; pageInfo: PageInfo };
}

interface ProjectResponse {
  organization?: { projectV2: ProjectNode | null } | null;
  user?: { projectV2: ProjectNode | null } | null;
}

const PROJECT_DATA_FRAGMENT = `
fragment ProjectData on ProjectV2 {
  id number title
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
          ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { name } } }
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

const ORGANIZATION_PROJECT_QUERY = `
query DiscoverOrganizationProject($owner: String!, $number: Int!, $fieldsCursor: String, $itemsCursor: String) {
  organization(login: $owner) { projectV2(number: $number) { ...ProjectData } }
}
${PROJECT_DATA_FRAGMENT}
`;

const USER_PROJECT_QUERY = `
query DiscoverUserProject($owner: String!, $number: Int!, $fieldsCursor: String, $itemsCursor: String) {
  user(login: $owner) { projectV2(number: $number) { ...ProjectData } }
}
${PROJECT_DATA_FRAGMENT}
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
  if (lower.includes("could not resolve to an organization") || lower.includes("could not resolve to a user")) {
    return diagnostic(
      "project_owner_not_found",
      "GitHub could not resolve the configured Project owner login; verify the owner/account name for the Project",
      "project",
    );
  }
  return diagnostic("project_api_error", `GitHub Project query failed: ${message}`, "project");
}

function normalizeFields(nodes: Array<RawField | null>): ProjectFieldDefinition[] {
  const byId = new Map<string, ProjectFieldDefinition>();
  for (const node of nodes) {
    if (!node) continue;
    const options = [...(node.options ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const allIterations = [
      ...(node.configuration?.iterations ?? []),
      ...(node.configuration?.completedIterations ?? []),
    ];
    const iterationById = new Map(allIterations.map((iteration) => [iteration.id, iteration]));
    const iterations = [...iterationById.values()].sort(
      (a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title),
    );
    byId.set(node.id, { id: node.id, name: node.name, dataType: node.dataType, options, iterations });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function fieldValue(value: RawFieldValue): string | number | undefined {
  if (value.__typename === "ProjectV2ItemFieldTextValue" && typeof value.text === "string") return value.text;
  if (value.__typename === "ProjectV2ItemFieldNumberValue" && typeof value.number === "number") return value.number;
  if (value.__typename === "ProjectV2ItemFieldDateValue" && typeof value.date === "string") return value.date;
  if (value.__typename === "ProjectV2ItemFieldSingleSelectValue" && typeof value.name === "string") return value.name;
  if (value.__typename === "ProjectV2ItemFieldIterationValue" && typeof value.title === "string") return value.title;
  return undefined;
}

function normalizeIssueItem(
  items: RawItem[],
  repository: string,
  issueNumber: number,
): DiscoveredProjectState["issueItem"] {
  const expectedRepository = repository.toLowerCase();
  const item = items.find(({ content }) =>
    content?.__typename === "Issue" &&
    content.number === issueNumber &&
    content.repository?.nameWithOwner?.toLowerCase() === expectedRepository,
  );
  if (!item) return { present: false, values: {} };

  const values: Record<string, string | number> = {};
  let iteration: string | undefined;
  for (const node of item.fieldValues.nodes) {
    const fieldName = node?.field?.name;
    if (!node || !fieldName) continue;
    const normalized = fieldValue(node);
    if (normalized === undefined) continue;
    values[fieldName] = normalized;
    if (node.__typename === "ProjectV2ItemFieldIterationValue" && typeof node.title === "string") {
      iteration = node.title;
    }
  }

  return {
    present: true,
    id: item.id,
    values: Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))),
    ...(iteration !== undefined ? { iteration } : {}),
  };
}

function validInput(input: DiscoverProjectInput): boolean {
  return Boolean(
    input.owner.trim() &&
    input.repository.includes("/") &&
    Number.isInteger(input.projectNumber) &&
    input.projectNumber > 0 &&
    Number.isInteger(input.issueNumber) &&
    input.issueNumber > 0,
  );
}

function queryOwnerKind(error: unknown): "organization" | "user" | null {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("could not resolve to an organization")) return "organization";
  if (lower.includes("could not resolve to a user")) return "user";
  return null;
}

export class ReadOnlyProjectAdapter {
  constructor(private readonly transport: GraphqlTransport) {}

  private async discoverWithQuery(
    query: string,
    input: DiscoverProjectInput,
  ): Promise<ProjectDiscoveryResult> {
    const fieldNodes: Array<RawField | null> = [];
    const itemNodes: RawItem[] = [];
    let fieldsCursor: string | null = null;
    let itemsCursor: string | null = null;
    let project: ProjectNode | null = null;

    do {
      const response: ProjectResponse = await this.transport.execute<ProjectResponse>(query, {
        owner: input.owner,
        number: input.projectNumber,
        fieldsCursor,
        itemsCursor,
      });
      const pageProject: ProjectNode | null =
        response.organization?.projectV2 ?? response.user?.projectV2 ?? null;
      if (!pageProject) {
        return {
          ok: false,
          diagnostics: [diagnostic(
            "project_not_found",
            `Project #${input.projectNumber} was not found for '${input.owner}'`,
            "project",
          )],
        };
      }

      project ??= pageProject;
      fieldNodes.push(...pageProject.fields.nodes);
      for (const item of pageProject.items.nodes) if (item) itemNodes.push(item);
      fieldsCursor = pageProject.fields.pageInfo.hasNextPage ? pageProject.fields.pageInfo.endCursor : null;
      itemsCursor = pageProject.items.pageInfo.hasNextPage ? pageProject.items.pageInfo.endCursor : null;
    } while (fieldsCursor !== null || itemsCursor !== null);

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

  async discover(input: DiscoverProjectInput): Promise<ProjectDiscoveryResult> {
    if (!validInput(input)) {
      return {
        ok: false,
        diagnostics: [diagnostic(
          "invalid_project_input",
          "owner, owner/repository, positive project number and positive issue number are required",
          "project",
        )],
      };
    }

    try {
      return await this.discoverWithQuery(ORGANIZATION_PROJECT_QUERY, input);
    } catch (error) {
      if (queryOwnerKind(error) !== "organization") {
        return { ok: false, diagnostics: [normalizeError(error)] };
      }
    }

    try {
      return await this.discoverWithQuery(USER_PROJECT_QUERY, input);
    } catch (error) {
      return { ok: false, diagnostics: [normalizeError(error)] };
    }
  }
}
