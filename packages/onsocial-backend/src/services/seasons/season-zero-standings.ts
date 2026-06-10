import { indexerQuery } from '../../db/indexer.js';
import {
  SEASON_ZERO_ID,
  SEASON_ZERO_JOIN_RALLY_MIN_YOCTO,
  SEASON_ZERO_SCORING_LIMITS,
  scoreSeasonZero,
  type SeasonZeroProfileSignals,
  type SeasonZeroScoreBreakdown,
  type SeasonZeroSocialDailySignals,
} from './season-zero-policy.js';

interface JoinedRallyRow {
  account_id: string;
  join_amount_yocto: string;
  joined_at_ns: string;
  join_count: number;
}

interface ProfileRow {
  account_id: string;
  field: string;
  value: string | null;
}

interface EndorsementRow {
  target: string;
  issuer: string;
  value: string | null;
  block_timestamp: string;
}

interface StandEventRow {
  target_account: string;
  staker: string;
  block_timestamp: string;
}

interface SupportRow {
  account_id: string;
  support_received_yocto: string;
}

interface BoostRow {
  account_id: string;
  effective_boost: string;
}

export interface SeasonZeroStanding {
  rank: number;
  accountId: string;
  joinedAtNs: string;
  joinAmountYocto: string;
  joinCount: number;
  eligible: boolean;
  score: number;
  breakdown: SeasonZeroScoreBreakdown;
  profile: SeasonZeroProfileSignals;
  signals: {
    uniqueEndorsers: number;
    endorsementTopics: number;
    receivedStands: number;
    mutualStands: number;
    supportReceivedYocto: string;
    effectiveBoostYocto: string;
  };
}

export interface SeasonZeroStandingsResult {
  seasonId: string;
  limit: number;
  offset: number;
  total: number;
  scoring: typeof SEASON_ZERO_SCORING_LIMITS;
  standings: SeasonZeroStanding[];
}

interface SeasonZeroStandingsOptions {
  limit?: number;
  offset?: number;
  accountId?: string;
  cutoffTimestampNs?: string;
  unbounded?: boolean;
}

function normalizePageValue(
  value: number | undefined,
  fallback: number
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function linkCount(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return 0;
    return Object.values(parsed).filter(
      (value) => typeof value === 'string' && value.trim().length > 0
    ).length;
  } catch {
    return 0;
  }
}

function endorsementTopic(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { topic?: unknown };
    return typeof parsed.topic === 'string' && parsed.topic.trim()
      ? parsed.topic.trim().toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function utcDayKey(blockTimestamp: string): string {
  const ns = parseYoctoNs(blockTimestamp);
  const sec = Number(ns / 1_000_000_000n);
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function parseYoctoNs(value: string): bigint {
  if (!/^\d+$/u.test(value)) return 0n;
  return BigInt(value);
}

function sortedDailyCounts<T>(
  buckets: Map<string, T>,
  measure: (value: T) => number
): number[] {
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, bucket]) => measure(bucket));
}

function endorsementDailySignals(rows: EndorsementRow[]): Map<
  string,
  SeasonZeroSocialDailySignals & {
    uniqueEndorsers: number;
    endorsementTopics: number;
  }
> {
  const endorsersByTargetDay = new Map<string, Map<string, Set<string>>>();
  const topicsByTargetDay = new Map<string, Map<string, Set<string>>>();
  const endorsersSeason = new Map<string, Set<string>>();
  const topicsSeason = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.target || !row.issuer || row.target === row.issuer) continue;
    const day = utcDayKey(row.block_timestamp);

    const endorserDays =
      endorsersByTargetDay.get(row.target) ?? new Map<string, Set<string>>();
    const endorserSet = endorserDays.get(day) ?? new Set<string>();
    endorserSet.add(row.issuer);
    endorserDays.set(day, endorserSet);
    endorsersByTargetDay.set(row.target, endorserDays);

    const seasonEndorsers =
      endorsersSeason.get(row.target) ?? new Set<string>();
    seasonEndorsers.add(row.issuer);
    endorsersSeason.set(row.target, seasonEndorsers);

    const topic = endorsementTopic(row.value);
    if (topic) {
      const topicDays =
        topicsByTargetDay.get(row.target) ?? new Map<string, Set<string>>();
      const topicSet = topicDays.get(day) ?? new Set<string>();
      topicSet.add(topic);
      topicDays.set(day, topicSet);
      topicsByTargetDay.set(row.target, topicDays);

      const seasonTopics = topicsSeason.get(row.target) ?? new Set<string>();
      seasonTopics.add(topic);
      topicsSeason.set(row.target, seasonTopics);
    }
  }

  const result = new Map<
    string,
    SeasonZeroSocialDailySignals & {
      uniqueEndorsers: number;
      endorsementTopics: number;
    }
  >();

  for (const [accountId, endorserDays] of endorsersByTargetDay) {
    const topicDays = topicsByTargetDay.get(accountId) ?? new Map();
    result.set(accountId, {
      endorsersByDay: sortedDailyCounts(endorserDays, (set) => set.size),
      topicsByDay: sortedDailyCounts(topicDays, (set) => set.size),
      receivedStandsByDay: [],
      mutualStandsByDay: [],
      uniqueEndorsers: endorsersSeason.get(accountId)?.size ?? 0,
      endorsementTopics: topicsSeason.get(accountId)?.size ?? 0,
    });
  }

  return result;
}

function standDailySignals(rows: StandEventRow[]): Map<
  string,
  SeasonZeroSocialDailySignals & {
    receivedStands: number;
    mutualStands: number;
  }
> {
  const incomingByTarget = new Map<string, StandEventRow[]>();
  const outgoingByStaker = new Map<string, Set<string>>();

  for (const row of rows) {
    if (
      !row.target_account ||
      !row.staker ||
      row.target_account === row.staker
    ) {
      continue;
    }
    const incoming = incomingByTarget.get(row.target_account) ?? [];
    incoming.push(row);
    incomingByTarget.set(row.target_account, incoming);

    const targets = outgoingByStaker.get(row.staker) ?? new Set<string>();
    targets.add(row.target_account);
    outgoingByStaker.set(row.staker, targets);
  }

  const result = new Map<
    string,
    SeasonZeroSocialDailySignals & {
      receivedStands: number;
      mutualStands: number;
    }
  >();

  for (const [accountId, incoming] of incomingByTarget) {
    const standsWith = outgoingByStaker.get(accountId) ?? new Set<string>();
    const byDay = new Map<
      string,
      { received: Set<string>; mutual: Set<string> }
    >();
    const seasonReceived = new Set<string>();
    const seasonMutual = new Set<string>();

    for (const event of incoming) {
      const day = utcDayKey(event.block_timestamp);
      const bucket = byDay.get(day) ?? {
        received: new Set<string>(),
        mutual: new Set<string>(),
      };
      bucket.received.add(event.staker);
      seasonReceived.add(event.staker);
      if (standsWith.has(event.staker)) {
        bucket.mutual.add(event.staker);
        seasonMutual.add(event.staker);
      }
      byDay.set(day, bucket);
    }

    result.set(accountId, {
      endorsersByDay: [],
      topicsByDay: [],
      receivedStandsByDay: sortedDailyCounts(
        byDay,
        (bucket) => bucket.received.size
      ),
      mutualStandsByDay: sortedDailyCounts(
        byDay,
        (bucket) => bucket.mutual.size
      ),
      receivedStands: seasonReceived.size,
      mutualStands: seasonMutual.size,
    });
  }

  return result;
}

function mergeSocialSignals(
  endorsement:
    | (SeasonZeroSocialDailySignals & {
        uniqueEndorsers: number;
        endorsementTopics: number;
      })
    | undefined,
  stands:
    | (SeasonZeroSocialDailySignals & {
        receivedStands: number;
        mutualStands: number;
      })
    | undefined
): SeasonZeroSocialDailySignals & {
  uniqueEndorsers: number;
  endorsementTopics: number;
  receivedStands: number;
  mutualStands: number;
} {
  return {
    endorsersByDay: endorsement?.endorsersByDay ?? [],
    topicsByDay: endorsement?.topicsByDay ?? [],
    receivedStandsByDay: stands?.receivedStandsByDay ?? [],
    mutualStandsByDay: stands?.mutualStandsByDay ?? [],
    uniqueEndorsers: endorsement?.uniqueEndorsers ?? 0,
    endorsementTopics: endorsement?.endorsementTopics ?? 0,
    receivedStands: stands?.receivedStands ?? 0,
    mutualStands: stands?.mutualStands ?? 0,
  };
}

/** Participants who joined rally (optionally capped at settlement cutoff). */
function joinedRallyCte(hasCutoff: boolean): string {
  return `joined AS (
    SELECT
      spender_id AS account_id,
      SUM(amount::numeric)::text AS join_amount_yocto,
      MIN(block_timestamp) AS joined_at_ns,
      COUNT(*)::int AS join_count
    FROM social_spend_events
    WHERE event_type = 'SOCIAL_SPENT'
      AND success = true
      AND action = 'join_rally'
      AND season_id = $1
      AND spender_id IS NOT NULL
      AND spender_id != ''
      ${hasCutoff ? 'AND block_timestamp <= $3::numeric' : ''}
    GROUP BY spender_id
    HAVING SUM(amount::numeric) >= $2::numeric
  )`;
}

function joinedRallyParams(
  seasonId: string,
  hasCutoff: boolean,
  cutoffParam: string
): [string, string] | [string, string, string] {
  return hasCutoff
    ? [seasonId, SEASON_ZERO_JOIN_RALLY_MIN_YOCTO.toString(), cutoffParam]
    : [seasonId, SEASON_ZERO_JOIN_RALLY_MIN_YOCTO.toString()];
}

/** Activity counted only after rally join; settlement also caps at season end. */
function seasonActivityWindow(hasCutoff: boolean, column: string): string {
  return hasCutoff
    ? `AND ${column} >= j.joined_at_ns AND ${column} <= $3::numeric`
    : `AND ${column} >= j.joined_at_ns`;
}

function profileSignals(
  rows: ProfileRow[]
): Map<string, SeasonZeroProfileSignals> {
  const profiles = new Map<string, SeasonZeroProfileSignals>();
  for (const row of rows) {
    const current =
      profiles.get(row.account_id) ??
      ({
        hasName: false,
        hasBio: false,
        hasAvatar: false,
        linkCount: 0,
      } satisfies SeasonZeroProfileSignals);
    const value = row.value?.trim() ?? '';
    if (row.field === 'name') current.hasName = value.length > 0;
    if (row.field === 'bio') current.hasBio = value.length > 0;
    if (row.field === 'avatar') current.hasAvatar = value.length > 0;
    if (row.field === 'links') current.linkCount = linkCount(row.value);
    profiles.set(row.account_id, current);
  }
  return profiles;
}

export async function getSeasonStandings(
  seasonId: string,
  opts: SeasonZeroStandingsOptions = {}
): Promise<SeasonZeroStandingsResult> {
  const rawLimit = normalizePageValue(opts.limit, 50);
  const limit = opts.unbounded ? rawLimit : Math.min(rawLimit, 100);
  const offset = normalizePageValue(opts.offset, 0);
  const cutoffTimestampNs = opts.cutoffTimestampNs?.trim();
  const cutoffParam = cutoffTimestampNs ?? '';
  const hasCutoff = Boolean(cutoffTimestampNs);

  const joinedParams = joinedRallyParams(seasonId, hasCutoff, cutoffParam);
  const activityWindow = seasonActivityWindow(hasCutoff, 'du.block_timestamp');
  const spendWindow = seasonActivityWindow(hasCutoff, 's.block_timestamp');
  const boostWindow = seasonActivityWindow(hasCutoff, 'be.block_timestamp');

  const joined = await indexerQuery<JoinedRallyRow>(
    `WITH ${joinedRallyCte(hasCutoff)}
     SELECT
       account_id,
       join_amount_yocto,
       joined_at_ns::text AS joined_at_ns,
       join_count
     FROM joined`,
    [...joinedParams]
  );

  if (joined.rows.length === 0) {
    return {
      seasonId,
      limit,
      offset,
      total: 0,
      scoring: SEASON_ZERO_SCORING_LIMITS,
      standings: [],
    };
  }

  const [profiles, endorsements, stands, support, boost] = await Promise.all([
    indexerQuery<ProfileRow>(
      hasCutoff
        ? `WITH ${joinedRallyCte(true)}
           SELECT account_id, field, value
           FROM (
             SELECT DISTINCT ON (du.account_id, du.data_id)
               du.account_id,
               du.data_id AS field,
               du.value,
               du.operation
             FROM data_updates du
             INNER JOIN joined j ON j.account_id = du.account_id
             WHERE du.data_type = 'profile'
               AND du.data_id IN ('name', 'bio', 'avatar', 'links')
               ${activityWindow}
             ORDER BY du.account_id, du.data_id, du.block_height DESC, du.block_timestamp DESC, du.receipt_id DESC, du.id DESC
           ) latest
           WHERE operation = 'set'`
        : `WITH ${joinedRallyCte(false)}
           SELECT account_id, field, value
           FROM (
             SELECT DISTINCT ON (du.account_id, du.data_id)
               du.account_id,
               du.data_id AS field,
               du.value,
               du.operation
             FROM data_updates du
             INNER JOIN joined j ON j.account_id = du.account_id
             WHERE du.data_type = 'profile'
               AND du.data_id IN ('name', 'bio', 'avatar', 'links')
               ${activityWindow}
             ORDER BY du.account_id, du.data_id, du.block_height DESC, du.block_timestamp DESC, du.receipt_id DESC, du.id DESC
           ) latest
           WHERE operation = 'set'`,
      [...joinedParams]
    ),
    indexerQuery<EndorsementRow>(
      hasCutoff
        ? `WITH ${joinedRallyCte(true)}
           SELECT target, issuer, value, block_timestamp::text AS block_timestamp
           FROM (
             SELECT DISTINCT ON (du.account_id, du.path)
               du.account_id AS issuer,
               du.target_account AS target,
               du.value,
               du.operation,
               du.block_timestamp
             FROM data_updates du
             INNER JOIN joined j ON j.account_id = du.target_account
             WHERE du.data_type = 'endorsement'
               ${activityWindow}
             ORDER BY du.account_id, du.path, du.block_height DESC, du.block_timestamp DESC, du.receipt_id DESC, du.id DESC
           ) latest
           WHERE operation = 'set'
             AND issuer IS NOT NULL
             AND issuer != target`
        : `WITH ${joinedRallyCte(false)}
           SELECT
             e.target,
             e.issuer,
             e.value,
             e.block_timestamp::text AS block_timestamp
           FROM endorsements_current e
           INNER JOIN joined j ON j.account_id = e.target
           WHERE e.operation = 'set'
             AND e.issuer IS NOT NULL
             AND e.issuer != e.target
             ${seasonActivityWindow(false, 'e.block_timestamp')}`,
      [...joinedParams]
    ),
    indexerQuery<StandEventRow>(
      hasCutoff
        ? `WITH ${joinedRallyCte(true)},
           latest_stands AS (
             SELECT
               account_id AS staker,
               target_account,
               block_timestamp
             FROM (
               SELECT DISTINCT ON (du.account_id, du.target_account)
                 du.account_id,
                 du.target_account,
                 du.operation,
                 du.block_timestamp
               FROM data_updates du
               INNER JOIN joined j ON j.account_id = du.target_account
               WHERE du.data_type = 'standing'
                 AND du.target_account IS NOT NULL
                 AND du.target_account != ''
                 ${activityWindow}
               ORDER BY du.account_id, du.target_account, du.block_height DESC, du.block_timestamp DESC, du.receipt_id DESC, du.id DESC
             ) latest
             WHERE operation = 'set'
           )
           SELECT
             target_account,
             staker,
             block_timestamp::text AS block_timestamp
           FROM latest_stands`
        : `WITH ${joinedRallyCte(false)}
           SELECT
             incoming.target_account,
             incoming.account_id AS staker,
             incoming.block_timestamp::text AS block_timestamp
           FROM standings_current incoming
           INNER JOIN joined j ON j.account_id = incoming.target_account
           WHERE 1=1
             ${seasonActivityWindow(false, 'incoming.block_timestamp')}`,
      [...joinedParams]
    ),
    indexerQuery<SupportRow>(
      `WITH ${joinedRallyCte(hasCutoff)}
       SELECT
         COALESCE(NULLIF(s.recipient_id, ''), s.target_id) AS account_id,
         SUM(s.target_amount::numeric)::text AS support_received_yocto
       FROM social_spend_events s
       INNER JOIN joined j
         ON j.account_id = COALESCE(NULLIF(s.recipient_id, ''), s.target_id)
       WHERE s.event_type = 'SOCIAL_SPENT'
         AND s.success = true
         AND s.action = 'support_profile'
         AND s.target_type = 'profile'
         ${spendWindow}
       GROUP BY COALESCE(NULLIF(s.recipient_id, ''), s.target_id)`,
      [...joinedParams]
    ),
    indexerQuery<BoostRow>(
      `WITH ${joinedRallyCte(hasCutoff)}
       SELECT
         account_id,
         CASE
           WHEN event_type = 'BOOST_UNLOCK' THEN '0'
           WHEN event_type = 'BOOST_EXTEND' THEN COALESCE(new_effective_boost, effective_boost, '0')
           ELSE COALESCE(effective_boost, new_effective_boost, '0')
         END AS effective_boost
       FROM (
         SELECT DISTINCT ON (be.account_id)
           be.account_id,
           be.event_type,
           be.effective_boost,
           be.new_effective_boost
         FROM boost_events be
         INNER JOIN joined j ON j.account_id = be.account_id
         WHERE be.success = true
           AND be.event_type IN ('BOOST_LOCK', 'BOOST_EXTEND', 'BOOST_UNLOCK')
           ${boostWindow}
         ORDER BY be.account_id, be.block_height DESC, be.block_timestamp DESC, be.receipt_id DESC, be.id DESC
       ) latest_boost`,
      [...joinedParams]
    ),
  ]);

  const profileByAccount = profileSignals(profiles.rows);
  const endorsementByAccount = endorsementDailySignals(endorsements.rows);
  const standByAccount = standDailySignals(stands.rows);
  const supportByAccount = new Map(
    support.rows.map((row) => [row.account_id, row.support_received_yocto])
  );
  const boostByAccount = new Map(
    boost.rows.map((row) => [row.account_id, row.effective_boost])
  );

  const rankedStandings = joined.rows
    .map((row): Omit<SeasonZeroStanding, 'rank'> => {
      const profile =
        profileByAccount.get(row.account_id) ??
        ({
          hasName: false,
          hasBio: false,
          hasAvatar: false,
          linkCount: 0,
        } satisfies SeasonZeroProfileSignals);
      const social = mergeSocialSignals(
        endorsementByAccount.get(row.account_id),
        standByAccount.get(row.account_id)
      );
      const supportReceivedYocto = supportByAccount.get(row.account_id) ?? '0';
      const effectiveBoostYocto = boostByAccount.get(row.account_id) ?? '0';
      const scored = scoreSeasonZero({
        accountId: row.account_id,
        joinAmountYocto: row.join_amount_yocto,
        profile,
        uniqueEndorsers: social.uniqueEndorsers,
        endorsementTopics: social.endorsementTopics,
        receivedStands: social.receivedStands,
        mutualStands: social.mutualStands,
        supportReceivedYocto,
        effectiveBoostYocto,
        daily: {
          endorsersByDay: social.endorsersByDay,
          topicsByDay: social.topicsByDay,
          receivedStandsByDay: social.receivedStandsByDay,
          mutualStandsByDay: social.mutualStandsByDay,
        },
      });

      return {
        accountId: row.account_id,
        joinedAtNs: row.joined_at_ns,
        joinAmountYocto: row.join_amount_yocto,
        joinCount: row.join_count,
        eligible: scored.eligible,
        score: scored.breakdown.total,
        breakdown: scored.breakdown,
        profile,
        signals: {
          uniqueEndorsers: social.uniqueEndorsers,
          endorsementTopics: social.endorsementTopics,
          receivedStands: social.receivedStands,
          mutualStands: social.mutualStands,
          supportReceivedYocto,
          effectiveBoostYocto,
        },
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.joinedAtNs.localeCompare(b.joinedAtNs);
    })
    .map((standing, index) => ({ ...standing, rank: index + 1 }));

  const standings = opts.accountId
    ? rankedStandings.filter(
        (standing) => standing.accountId === opts.accountId
      )
    : rankedStandings;

  const page = standings.slice(offset, offset + limit);

  return {
    seasonId,
    limit,
    offset,
    total: rankedStandings.length,
    scoring: SEASON_ZERO_SCORING_LIMITS,
    standings: page,
  };
}

export async function getSeasonZeroStandings(
  opts: SeasonZeroStandingsOptions = {}
): Promise<SeasonZeroStandingsResult> {
  return getSeasonStandings(SEASON_ZERO_ID, opts);
}
