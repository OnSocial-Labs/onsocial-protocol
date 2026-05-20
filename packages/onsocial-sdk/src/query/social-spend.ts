// ---------------------------------------------------------------------------
// Social Spend event queries (spends, seasons, settlement roots, payouts).
// Accessed as `os.query.socialSpend.<method>()`.
//
// Backed by `social_spend_events`, populated by the social-spend Substreams
// indexer. Most columns are sparse, so consumers should branch on `eventType`.
// For live claim status or balances, query the social-spend contract directly.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import {
  SOCIAL_SPEND_EVENT_TYPES,
  type SocialSpendEventType,
} from './social-spend-events.js';

export interface SocialSpendEventRow {
  id: string;
  blockHeight: number;
  blockTimestamp: number;
  receiptId: string;
  accountId: string;
  eventType: string;
  success: boolean;

  spenderId: string | null;
  amount: string | null;
  appId: string | null;
  action: string | null;
  targetType: string | null;
  targetId: string | null;
  seasonId: string | null;
  tag: string | null;
  recipientId: string | null;
  treasuryAmount: string | null;
  seasonAmount: string | null;
  targetAmount: string | null;
  metadata: string | null;

  label: string | null;
  active: boolean | null;
  startsAtNs: number | null;
  endsAtNs: number | null;
  claimStartsAtNs: number | null;
  root: string | null;
  totalAmount: string | null;

  paused: boolean | null;
  oldTreasuryId: string | null;
  treasuryId: string | null;
  settlementPublisher: string | null;
  ownerId: string | null;
  oldVersion: string | null;
  newVersion: string | null;
  extraData: string | null;
}

const SOCIAL_SPEND_EVENT_FIELDS = `
  id
  blockHeight
  blockTimestamp
  receiptId
  accountId
  eventType
  success
  spenderId
  amount
  appId
  action
  targetType
  targetId
  seasonId
  tag
  recipientId
  treasuryAmount
  seasonAmount
  targetAmount
  metadata
  label
  active
  startsAtNs
  endsAtNs
  claimStartsAtNs
  root
  totalAmount
  paused
  oldTreasuryId
  treasuryId
  settlementPublisher
  ownerId
  oldVersion
  newVersion
  extraData
`;

export { SOCIAL_SPEND_EVENT_TYPES, type SocialSpendEventType };

export class SocialSpendQuery {
  constructor(private _q: QueryModule) {}

  async events(
    opts: {
      eventType?:
        | SocialSpendEventType
        | SocialSpendEventType[]
        | string
        | string[];
      accountId?: string;
      spenderId?: string;
      appId?: string;
      action?: string;
      targetType?: string;
      targetId?: string;
      seasonId?: string;
      recipientId?: string;
      success?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<SocialSpendEventRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const variables: Record<string, unknown> = { limit, offset };
    const wheres: string[] = [];
    const params: string[] = ['$limit: Int!', '$offset: Int!'];

    const addEq = (col: string, key: string, val: unknown, gqlType: string) => {
      wheres.push(`${col}: {_eq: $${key}}`);
      params.push(`$${key}: ${gqlType}`);
      variables[key] = val;
    };
    const addIn = (
      col: string,
      key: string,
      vals: readonly unknown[],
      gqlType: string
    ) => {
      wheres.push(`${col}: {_in: $${key}}`);
      params.push(`$${key}: [${gqlType}!]!`);
      variables[key] = vals;
    };

    if (opts.eventType !== undefined) {
      if (Array.isArray(opts.eventType)) {
        addIn('eventType', 'eventType', opts.eventType, 'String');
      } else {
        addEq('eventType', 'eventType', opts.eventType, 'String!');
      }
    }
    if (opts.accountId)
      addEq('accountId', 'accountId', opts.accountId, 'String!');
    if (opts.spenderId)
      addEq('spenderId', 'spenderId', opts.spenderId, 'String!');
    if (opts.appId) addEq('appId', 'appId', opts.appId, 'String!');
    if (opts.action) addEq('action', 'action', opts.action, 'String!');
    if (opts.targetType)
      addEq('targetType', 'targetType', opts.targetType, 'String!');
    if (opts.targetId) addEq('targetId', 'targetId', opts.targetId, 'String!');
    if (opts.seasonId) addEq('seasonId', 'seasonId', opts.seasonId, 'String!');
    if (opts.recipientId)
      addEq('recipientId', 'recipientId', opts.recipientId, 'String!');
    if (opts.success !== undefined)
      addEq('success', 'success', opts.success, 'Boolean!');

    const whereClause = wheres.length ? `where: { ${wheres.join(', ')} },` : '';
    const res = await this._q.graphql<{
      socialSpendEvents: SocialSpendEventRow[];
    }>({
      query: `query SocialSpendEvents(${params.join(', ')}) {
        socialSpendEvents(
          ${whereClause}
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) { ${SOCIAL_SPEND_EVENT_FIELDS} }
      }`,
      variables,
    });
    return res.data?.socialSpendEvents ?? [];
  }

  async spendsByAccount(
    accountId: string,
    opts: { seasonId?: string; limit?: number; offset?: number } = {}
  ): Promise<SocialSpendEventRow[]> {
    return this.events({
      accountId,
      seasonId: opts.seasonId,
      eventType: SOCIAL_SPEND_EVENT_TYPES.SOCIAL_SPENT,
      success: true,
      limit: opts.limit,
      offset: opts.offset,
    });
  }

  async seasonActivity(
    seasonId: string,
    opts: { action?: string; limit?: number; offset?: number } = {}
  ): Promise<SocialSpendEventRow[]> {
    return this.events({
      seasonId,
      action: opts.action,
      eventType: SOCIAL_SPEND_EVENT_TYPES.SOCIAL_SPENT,
      success: true,
      limit: opts.limit,
      offset: opts.offset,
    });
  }

  async targetActivity(
    targetType: string,
    targetId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<SocialSpendEventRow[]> {
    return this.events({
      targetType,
      targetId,
      eventType: SOCIAL_SPEND_EVENT_TYPES.SOCIAL_SPENT,
      success: true,
      limit: opts.limit,
      offset: opts.offset,
    });
  }

  async latestSeasonRoot(
    seasonId: string
  ): Promise<SocialSpendEventRow | null> {
    const rows = await this.events({
      seasonId,
      eventType: SOCIAL_SPEND_EVENT_TYPES.SEASON_ROOT_PUBLISHED,
      limit: 1,
    });
    return rows[0] ?? null;
  }
}
