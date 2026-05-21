// ---------------------------------------------------------------------------
// Unified social graph queries.
// Accessed as `os.query.graph.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

export interface GraphEdgeRow {
  edgeId: string;
  sourceAccount: string;
  targetAccount: string;
  targetType: string;
  targetPath: string;
  edgeType: string;
  edgeKind: string;
  source: string;
  target: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
  operation: string;
  groupId?: string;
}

export interface GraphEdgeCountRow {
  accountId: string;
  targetType: string;
  edgeType: string;
  edgeKind: string;
  inboundCount: number;
  lastBlock: number;
}

export interface GraphEdgeFilter {
  sourceAccount?: string;
  targetAccount?: string;
  targetType?: string;
  targetPath?: string;
  edgeType?: string;
  edgeKind?: string;
  limit?: number;
  offset?: number;
}

export interface GraphCountFilter {
  edgeType?: string;
  edgeKind?: string;
  targetType?: string;
}

const GRAPH_EDGE_FIELDS = `
  edgeId sourceAccount targetAccount targetType targetPath edgeType edgeKind
  source target value blockHeight blockTimestamp operation groupId
`;

const GRAPH_COUNT_FIELDS = `
  accountId targetType edgeType edgeKind inboundCount lastBlock
`;

export class GraphQuery {
  constructor(private _q: QueryModule) {}

  /** Query current unified social graph edges. */
  async edges(filter: GraphEdgeFilter = {}): Promise<GraphEdgeRow[]> {
    const { where, variables } = buildEdgeWhere(filter);
    const res = await this._q.graphql<{ edgesCurrent: GraphEdgeRow[] }>({
      query: `query GraphEdges($limit: Int!, $offset: Int!${variablesDecl(variables)}) {
        edgesCurrent(${where}limit: $limit, offset: $offset, orderBy: [{blockHeight: DESC}]) {
          ${GRAPH_EDGE_FIELDS}
        }
      }`,
      variables: {
        ...variables,
        limit: filter.limit ?? 100,
        offset: filter.offset ?? 0,
      },
    });
    return res.data?.edgesCurrent ?? [];
  }

  /** Edges created by `accountId`. */
  outgoing(
    accountId: string,
    opts: Omit<GraphEdgeFilter, 'sourceAccount'> = {}
  ): Promise<GraphEdgeRow[]> {
    return this.edges({ ...opts, sourceAccount: accountId });
  }

  /** Edges targeting `accountId`. */
  incoming(
    accountId: string,
    opts: Omit<GraphEdgeFilter, 'targetAccount'> = {}
  ): Promise<GraphEdgeRow[]> {
    return this.edges({ ...opts, targetAccount: accountId });
  }

  /** Reactions and other content edges for one indexed content path. */
  forContent(
    targetAccount: string,
    targetPath: string,
    opts: Omit<
      GraphEdgeFilter,
      'targetAccount' | 'targetPath' | 'targetType'
    > = {}
  ): Promise<GraphEdgeRow[]> {
    return this.edges({
      ...opts,
      targetAccount,
      targetPath,
      targetType: 'content',
    });
  }

  /** Inbound edge counts for an account, grouped by edge type and kind. */
  async counts(
    accountId: string,
    filter: GraphCountFilter = {}
  ): Promise<GraphEdgeCountRow[]> {
    const { where, variables } = buildCountWhere(accountId, filter);
    const res = await this._q.graphql<{ edgeCounts: GraphEdgeCountRow[] }>({
      query: `query GraphEdgeCounts($accountId: String!${variablesDecl(variables)}) {
        edgeCounts(where: {${where}}, orderBy: [{lastBlock: DESC}]) {
          ${GRAPH_COUNT_FIELDS}
        }
      }`,
      variables: { accountId, ...variables },
    });
    return res.data?.edgeCounts ?? [];
  }
}

function buildEdgeWhere(filter: GraphEdgeFilter): {
  where: string;
  variables: Record<string, string>;
} {
  const clauses: string[] = [];
  const variables: Record<string, string> = {};

  addStringFilter(clauses, variables, 'sourceAccount', filter.sourceAccount);
  addStringFilter(clauses, variables, 'targetAccount', filter.targetAccount);
  addStringFilter(clauses, variables, 'targetType', filter.targetType);
  addStringFilter(clauses, variables, 'targetPath', filter.targetPath);
  addStringFilter(clauses, variables, 'edgeType', filter.edgeType);
  addStringFilter(clauses, variables, 'edgeKind', filter.edgeKind);

  return {
    where: clauses.length > 0 ? `where: {${clauses.join(', ')}}, ` : '',
    variables,
  };
}

function buildCountWhere(
  accountId: string,
  filter: GraphCountFilter
): { where: string; variables: Record<string, string> } {
  const clauses = ['accountId: {_eq: $accountId}'];
  const variables: Record<string, string> = {};

  addStringFilter(clauses, variables, 'targetType', filter.targetType);
  addStringFilter(clauses, variables, 'edgeType', filter.edgeType);
  addStringFilter(clauses, variables, 'edgeKind', filter.edgeKind);

  return { where: clauses.join(', '), variables };
}

function addStringFilter(
  clauses: string[],
  variables: Record<string, string>,
  field: string,
  value: string | undefined
): void {
  if (value === undefined) return;
  variables[field] = value;
  clauses.push(`${field}: {_eq: $${field}}`);
}

function variablesDecl(variables: Record<string, string>): string {
  return Object.keys(variables)
    .map((name) => `, $${name}: String!`)
    .join('');
}
