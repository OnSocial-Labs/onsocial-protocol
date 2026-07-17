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

const LEGACY_ENDORSEMENT_SPEND_PREFIX = 'legacy:';

export interface EndorsementSupporterAggregate {
  accountId: string;
  totalAmountYocto: string;
  spendCount: number;
  latestSupportAt: number | null;
}

export interface EndorsementSupportSummaryResult {
  totalAmountYocto: string;
  spendCount: number;
  supporterCount: number;
  previewSupporters: Array<{
    accountId: string;
    totalAmountYocto: string;
  }>;
}

export interface EndorsementSupportGivenRow {
  endorsementId: string;
  recipientId: string | null;
  totalAmountYocto: string;
  spendCount: number;
  latestSupportAt: number | null;
  issuer: string | null;
  topic: string | null;
}

/** Actions that credit the shared profile collect pot (`recipient_id`). */
export const SUPPORT_POT_ACTIONS = [
  'support_profile',
  'support_endorsement',
  'boost_post',
] as const;

export type SupportPotAction = (typeof SUPPORT_POT_ACTIONS)[number];

export interface SupportReceivedRow {
  spenderId: string;
  action: SupportPotAction;
  targetType: string | null;
  targetId: string | null;
  /** Author/target share credited to the recipient (yocto). */
  amountYocto: string;
  blockHeight: number;
  blockTimestamp: number;
}

export function parseLegacyEndorsementSpendTargetId(
  endorsementId: string
): { issuer: string; target: string; topic: string } | null {
  const trimmed = endorsementId.trim();
  if (!trimmed.startsWith(LEGACY_ENDORSEMENT_SPEND_PREFIX)) {
    return null;
  }

  const body = trimmed.slice(LEGACY_ENDORSEMENT_SPEND_PREFIX.length);
  const topicSep = body.lastIndexOf(':');
  if (topicSep <= 0) return null;
  const topic = body.slice(topicSep + 1);
  const rest = body.slice(0, topicSep);
  const targetSep = rest.lastIndexOf(':');
  if (targetSep <= 0) return null;
  const target = rest.slice(targetSep + 1);
  const issuer = rest.slice(0, targetSep);
  if (!issuer || !target) return null;

  return { issuer, target, topic };
}

function parseSupportEndorsementMetadata(metadata: string | null): {
  issuer?: string;
  topic?: string;
} {
  if (!metadata?.trim()) return {};
  try {
    const parsed = JSON.parse(metadata) as {
      issuer?: unknown;
      topic?: unknown;
    };
    return {
      issuer:
        typeof parsed.issuer === 'string' && parsed.issuer.trim()
          ? parsed.issuer.trim()
          : undefined,
      topic:
        typeof parsed.topic === 'string' && parsed.topic.trim()
          ? parsed.topic.trim()
          : undefined,
    };
  } catch {
    return {};
  }
}

function compareSupporterAggregates(
  a: EndorsementSupporterAggregate,
  b: EndorsementSupporterAggregate
): number {
  const amountDiff = BigInt(b.totalAmountYocto) - BigInt(a.totalAmountYocto);
  if (amountDiff > 0n) return 1;
  if (amountDiff < 0n) return -1;
  return (b.latestSupportAt ?? 0) - (a.latestSupportAt ?? 0);
}

export function aggregateEndorsementSupportRows(rows: SocialSpendEventRow[]): {
  totalAmountYocto: string;
  spendCount: number;
  supporters: EndorsementSupporterAggregate[];
} {
  const bySpender = new Map<
    string,
    { total: bigint; spendCount: number; latestSupportAt: number }
  >();
  let total = 0n;
  let spendCount = 0;

  for (const row of rows) {
    const spender = row.spenderId?.trim();
    if (!spender || !row.amount || !/^\d+$/.test(row.amount)) continue;
    total += BigInt(row.amount);
    spendCount += 1;
    const existing = bySpender.get(spender) ?? {
      total: 0n,
      spendCount: 0,
      latestSupportAt: 0,
    };
    existing.total += BigInt(row.amount);
    existing.spendCount += 1;
    existing.latestSupportAt = Math.max(
      existing.latestSupportAt,
      row.blockTimestamp ?? 0
    );
    bySpender.set(spender, existing);
  }

  const supporters = Array.from(bySpender.entries())
    .map(([accountId, stats]) => ({
      accountId,
      totalAmountYocto: stats.total.toString(),
      spendCount: stats.spendCount,
      latestSupportAt: stats.latestSupportAt > 0 ? stats.latestSupportAt : null,
    }))
    .sort(compareSupporterAggregates);

  return {
    totalAmountYocto: total.toString(),
    spendCount,
    supporters,
  };
}

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
      action?: string | string[];
      targetType?: string;
      targetId?: string;
      seasonId?: string;
      recipientId?: string;
      success?: boolean;
      /** Inclusive lower bound on `blockHeight`. */
      minBlockHeight?: number;
      /** Exclusive upper bound on `blockHeight` (strictly older than). */
      beforeBlockHeight?: number;
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
    if (opts.action !== undefined) {
      if (Array.isArray(opts.action)) {
        addIn('action', 'action', opts.action, 'String');
      } else {
        addEq('action', 'action', opts.action, 'String!');
      }
    }
    if (opts.targetType)
      addEq('targetType', 'targetType', opts.targetType, 'String!');
    if (opts.targetId) addEq('targetId', 'targetId', opts.targetId, 'String!');
    if (opts.seasonId) addEq('seasonId', 'seasonId', opts.seasonId, 'String!');
    if (opts.recipientId)
      addEq('recipientId', 'recipientId', opts.recipientId, 'String!');
    if (opts.success !== undefined)
      addEq('success', 'success', opts.success, 'Boolean!');
    if (opts.minBlockHeight != null || opts.beforeBlockHeight != null) {
      const heightParts: string[] = [];
      if (opts.minBlockHeight != null) {
        heightParts.push('_gte: $minBlockHeight');
        params.push('$minBlockHeight: bigint!');
        variables.minBlockHeight = opts.minBlockHeight;
      }
      if (opts.beforeBlockHeight != null) {
        heightParts.push('_lt: $beforeBlockHeight');
        params.push('$beforeBlockHeight: bigint!');
        variables.beforeBlockHeight = opts.beforeBlockHeight;
      }
      wheres.push(`blockHeight: { ${heightParts.join(', ')} }`);
    }

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
    opts: { action?: string; limit?: number; offset?: number } = {}
  ): Promise<SocialSpendEventRow[]> {
    return this.events({
      targetType,
      targetId,
      action: opts.action,
      eventType: SOCIAL_SPEND_EVENT_TYPES.SOCIAL_SPENT,
      success: true,
      limit: opts.limit,
      offset: opts.offset,
    });
  }

  async endorsementSupportSummary(
    endorsementId: string,
    opts: { limit?: number; previewLimit?: number } = {}
  ): Promise<EndorsementSupportSummaryResult> {
    const rows = await this.targetActivity('endorsement', endorsementId, {
      action: 'support_endorsement',
      limit: opts.limit ?? 500,
    });
    const aggregated = aggregateEndorsementSupportRows(rows);
    const previewLimit = Math.max(0, opts.previewLimit ?? 3);

    return {
      totalAmountYocto: aggregated.totalAmountYocto,
      spendCount: aggregated.spendCount,
      supporterCount: aggregated.supporters.length,
      previewSupporters: aggregated.supporters
        .slice(0, previewLimit)
        .map(({ accountId, totalAmountYocto }) => ({
          accountId,
          totalAmountYocto,
        })),
    };
  }

  async endorsementSupporters(
    endorsementId: string,
    opts: { limit?: number } = {}
  ): Promise<EndorsementSupporterAggregate[]> {
    const rows = await this.targetActivity('endorsement', endorsementId, {
      action: 'support_endorsement',
      limit: opts.limit ?? 500,
    });
    return aggregateEndorsementSupportRows(rows).supporters;
  }

  async endorsementSupportGiven(
    spenderAccountId: string,
    opts: { limit?: number; offset?: number; eventLimit?: number } = {}
  ): Promise<EndorsementSupportGivenRow[]> {
    const spenderId = spenderAccountId.trim();
    if (!spenderId) return [];

    const rows = await this.events({
      spenderId,
      action: 'support_endorsement',
      targetType: 'endorsement',
      eventType: SOCIAL_SPEND_EVENT_TYPES.SOCIAL_SPENT,
      success: true,
      limit: opts.eventLimit ?? 500,
      offset: opts.offset,
    });

    const byEndorsement = new Map<
      string,
      {
        total: bigint;
        spendCount: number;
        latestSupportAt: number;
        recipientId: string | null;
        issuer: string | null;
        topic: string | null;
      }
    >();

    for (const row of rows) {
      const endorsementId = row.targetId?.trim();
      if (!endorsementId || !row.amount || !/^\d+$/.test(row.amount)) continue;

      const metadata = parseSupportEndorsementMetadata(row.metadata);
      const legacy = parseLegacyEndorsementSpendTargetId(endorsementId);
      const existing = byEndorsement.get(endorsementId) ?? {
        total: 0n,
        spendCount: 0,
        latestSupportAt: 0,
        recipientId: row.recipientId?.trim() || legacy?.target || null,
        issuer: metadata.issuer ?? legacy?.issuer ?? null,
        topic: metadata.topic ?? legacy?.topic ?? null,
      };

      existing.total += BigInt(row.amount);
      existing.spendCount += 1;
      existing.latestSupportAt = Math.max(
        existing.latestSupportAt,
        row.blockTimestamp ?? 0
      );
      if (!existing.recipientId && row.recipientId?.trim()) {
        existing.recipientId = row.recipientId.trim();
      }
      if (!existing.issuer && metadata.issuer) {
        existing.issuer = metadata.issuer;
      }
      if (!existing.topic && metadata.topic) {
        existing.topic = metadata.topic;
      }
      if (!existing.issuer && legacy?.issuer) {
        existing.issuer = legacy.issuer;
      }
      if (!existing.topic && legacy?.topic) {
        existing.topic = legacy.topic;
      }
      if (!existing.recipientId && legacy?.target) {
        existing.recipientId = legacy.target;
      }

      byEndorsement.set(endorsementId, existing);
    }

    const limit = Math.max(1, opts.limit ?? 50);

    return Array.from(byEndorsement.entries())
      .map(([endorsementId, stats]) => ({
        endorsementId,
        recipientId: stats.recipientId,
        totalAmountYocto: stats.total.toString(),
        spendCount: stats.spendCount,
        latestSupportAt:
          stats.latestSupportAt > 0 ? stats.latestSupportAt : null,
        issuer: stats.issuer,
        topic: stats.topic,
      }))
      .sort((a, b) => {
        const amountDiff =
          BigInt(b.totalAmountYocto) - BigInt(a.totalAmountYocto);
        if (amountDiff > 0n) return 1;
        if (amountDiff < 0n) return -1;
        return (b.latestSupportAt ?? 0) - (a.latestSupportAt ?? 0);
      })
      .slice(0, limit);
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

  /**
   * Latest `SOCIAL_TRANSFERRED` for an account (owner Collect), or null if
   * they have never claimed the target pot.
   */
  async lastTargetCollect(
    accountId: string
  ): Promise<{ blockHeight: number; blockTimestamp: number } | null> {
    const id = accountId.trim();
    if (!id) return null;
    const rows = await this.events({
      accountId: id,
      eventType: SOCIAL_SPEND_EVENT_TYPES.SOCIAL_TRANSFERRED,
      limit: 1,
    });
    const row = rows[0];
    if (!row || !Number.isFinite(row.blockHeight)) return null;
    return {
      blockHeight: row.blockHeight,
      blockTimestamp: row.blockTimestamp,
    };
  }

  /**
   * SOCIAL credited to a profile collect pot — profile support, endorsement
   * support, and boost-post author share (`recipient_id` = owner).
   *
   * Use `minBlockHeight` / `beforeBlockHeight` to split “in this collect”
   * (credits after the last claim) from earlier history.
   */
  async supportReceived(
    recipientAccountId: string,
    opts: {
      limit?: number;
      offset?: number;
      minBlockHeight?: number;
      beforeBlockHeight?: number;
    } = {}
  ): Promise<SupportReceivedRow[]> {
    const recipientId = recipientAccountId.trim();
    if (!recipientId) return [];

    const rows = await this.events({
      recipientId,
      action: [...SUPPORT_POT_ACTIONS],
      eventType: SOCIAL_SPEND_EVENT_TYPES.SOCIAL_SPENT,
      success: true,
      minBlockHeight: opts.minBlockHeight,
      beforeBlockHeight: opts.beforeBlockHeight,
      limit: opts.limit ?? 40,
      offset: opts.offset,
    });

    return rows
      .map((row): SupportReceivedRow | null => {
        const spenderId = row.spenderId?.trim();
        const action = row.action?.trim();
        if (!spenderId || !action) return null;
        if (!SUPPORT_POT_ACTIONS.includes(action as SupportPotAction)) {
          return null;
        }
        const amountYocto =
          (row.targetAmount?.trim() || row.amount?.trim() || '0').replace(
            /^0+(?=\d)/,
            ''
          ) || '0';
        return {
          spenderId,
          action: action as SupportPotAction,
          targetType: row.targetType,
          targetId: row.targetId,
          amountYocto,
          blockHeight: row.blockHeight,
          blockTimestamp: row.blockTimestamp,
        };
      })
      .filter((row): row is SupportReceivedRow => row != null);
  }
}
