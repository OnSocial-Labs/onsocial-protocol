import { indexerQuery } from '../../db/indexer.js';
import {
  SEASON_ZERO_ID,
  SEASON_ZERO_JOIN_RALLY_MIN_YOCTO,
  scoreSeasonZero,
  type SeasonZeroProfileSignals,
  type SeasonZeroScoreBreakdown,
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
}

interface StandRow {
  account_id: string;
  received_stands: string;
  mutual_stands: string;
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
  seasonId: typeof SEASON_ZERO_ID;
  limit: number;
  offset: number;
  total: number;
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

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

function endorsementSignals(
  rows: EndorsementRow[]
): Map<string, { uniqueEndorsers: number; endorsementTopics: number }> {
  const endorsersByTarget = new Map<string, Set<string>>();
  const topicsByTarget = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.target || !row.issuer || row.target === row.issuer) continue;
    const endorsers = endorsersByTarget.get(row.target) ?? new Set<string>();
    endorsers.add(row.issuer);
    endorsersByTarget.set(row.target, endorsers);

    const topic = endorsementTopic(row.value);
    if (topic) {
      const topics = topicsByTarget.get(row.target) ?? new Set<string>();
      topics.add(topic);
      topicsByTarget.set(row.target, topics);
    }
  }

  const result = new Map<
    string,
    { uniqueEndorsers: number; endorsementTopics: number }
  >();
  for (const [accountId, endorsers] of endorsersByTarget) {
    result.set(accountId, {
      uniqueEndorsers: endorsers.size,
      endorsementTopics: topicsByTarget.get(accountId)?.size ?? 0,
    });
  }
  return result;
}

export async function getSeasonZeroStandings(
  opts: SeasonZeroStandingsOptions = {}
): Promise<SeasonZeroStandingsResult> {
  const rawLimit = normalizePageValue(opts.limit, 50);
  const limit = opts.unbounded ? rawLimit : Math.min(rawLimit, 100);
  const offset = normalizePageValue(opts.offset, 0);
  const cutoffTimestampNs = opts.cutoffTimestampNs?.trim();
  const cutoffParam = cutoffTimestampNs ?? '';
  const hasCutoff = Boolean(cutoffTimestampNs);

  const joined = await indexerQuery<JoinedRallyRow>(
    `SELECT
       spender_id AS account_id,
       SUM(amount::numeric)::text AS join_amount_yocto,
       MIN(block_timestamp)::text AS joined_at_ns,
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
     HAVING SUM(amount::numeric) >= $2::numeric`,
    hasCutoff
      ? [
          SEASON_ZERO_ID,
          SEASON_ZERO_JOIN_RALLY_MIN_YOCTO.toString(),
          cutoffParam,
        ]
      : [SEASON_ZERO_ID, SEASON_ZERO_JOIN_RALLY_MIN_YOCTO.toString()]
  );

  const accounts = joined.rows.map((row) => row.account_id);
  if (accounts.length === 0) {
    return { seasonId: SEASON_ZERO_ID, limit, offset, total: 0, standings: [] };
  }

  const joinedAtNs = joined.rows.map((row) => row.joined_at_ns);
  const joinWindowParams = [accounts, joinedAtNs] as const;
  const scoreAfterJoin = !hasCutoff;

  const [profiles, endorsements, stands, support, boost] = await Promise.all([
    indexerQuery<ProfileRow>(
      hasCutoff
        ? `SELECT account_id, field, value
           FROM (
             SELECT DISTINCT ON (account_id, data_id)
               account_id,
               data_id AS field,
               value,
               operation
             FROM data_updates
             WHERE data_type = 'profile'
               AND account_id = ANY($1::text[])
               AND data_id IN ('name', 'bio', 'avatar', 'links')
               AND block_timestamp <= $2::numeric
             ORDER BY account_id, data_id, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC
           ) latest
           WHERE operation = 'set'`
        : scoreAfterJoin
          ? `SELECT account_id, field, value
             FROM (
               SELECT DISTINCT ON (du.account_id, du.data_id)
                 du.account_id,
                 du.data_id AS field,
                 du.value,
                 du.operation
               FROM data_updates du
               INNER JOIN UNNEST($1::text[], $2::text[]) AS j(account_id, joined_at_ns)
                 ON j.account_id = du.account_id
               WHERE du.data_type = 'profile'
                 AND du.data_id IN ('name', 'bio', 'avatar', 'links')
                 AND du.block_timestamp >= j.joined_at_ns::numeric
               ORDER BY du.account_id, du.data_id, du.block_height DESC, du.block_timestamp DESC, du.receipt_id DESC, du.id DESC
             ) latest
             WHERE operation = 'set'`
          : `SELECT account_id, field, value
             FROM profiles_current
             WHERE account_id = ANY($1::text[])
               AND operation = 'set'
               AND field IN ('name', 'bio', 'avatar', 'links')`,
      hasCutoff ? [accounts, cutoffParam] : scoreAfterJoin ? [...joinWindowParams] : [accounts]
    ),
    indexerQuery<EndorsementRow>(
      hasCutoff
        ? `SELECT target, issuer, value
           FROM (
             SELECT DISTINCT ON (account_id, path)
               account_id AS issuer,
               target_account AS target,
               value,
               operation
             FROM data_updates
             WHERE data_type = 'endorsement'
               AND target_account = ANY($1::text[])
               AND block_timestamp <= $2::numeric
             ORDER BY account_id, path, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC
           ) latest
           WHERE operation = 'set'
             AND issuer IS NOT NULL
             AND issuer != target`
        : scoreAfterJoin
          ? `SELECT e.target, e.issuer, e.value
             FROM endorsements_current e
             INNER JOIN UNNEST($1::text[], $2::text[]) AS j(account_id, joined_at_ns)
               ON j.account_id = e.target
             WHERE e.operation = 'set'
               AND e.issuer IS NOT NULL
               AND e.issuer != e.target
               AND e.block_timestamp >= j.joined_at_ns::numeric`
          : `SELECT target, issuer, value
             FROM endorsements_current
             WHERE target = ANY($1::text[])
               AND operation = 'set'
               AND issuer IS NOT NULL
               AND issuer != target`,
      hasCutoff ? [accounts, cutoffParam] : scoreAfterJoin ? [...joinWindowParams] : [accounts]
    ),
    indexerQuery<StandRow>(
      hasCutoff
        ? `WITH latest_stands AS (
             SELECT *
             FROM (
               SELECT DISTINCT ON (account_id, target_account)
                 account_id,
                 target_account,
                 operation
               FROM data_updates
               WHERE data_type = 'standing'
                 AND target_account IS NOT NULL
                 AND target_account != ''
                 AND block_timestamp <= $2::numeric
               ORDER BY account_id, target_account, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC
             ) latest
             WHERE operation = 'set'
           )
           SELECT
             incoming.target_account AS account_id,
             COUNT(DISTINCT incoming.account_id)::text AS received_stands,
             COUNT(DISTINCT incoming.account_id)
               FILTER (WHERE outgoing.account_id IS NOT NULL)::text AS mutual_stands
           FROM latest_stands incoming
           LEFT JOIN latest_stands outgoing
             ON outgoing.account_id = incoming.target_account
            AND outgoing.target_account = incoming.account_id
           WHERE incoming.target_account = ANY($1::text[])
           GROUP BY incoming.target_account`
        : scoreAfterJoin
          ? `SELECT
               incoming.target_account AS account_id,
               COUNT(DISTINCT incoming.account_id)::text AS received_stands,
               COUNT(DISTINCT incoming.account_id)
                 FILTER (WHERE outgoing.account_id IS NOT NULL)::text AS mutual_stands
             FROM standings_current incoming
             INNER JOIN UNNEST($1::text[], $2::text[]) AS j(account_id, joined_at_ns)
               ON j.account_id = incoming.target_account
             LEFT JOIN standings_current outgoing
               ON outgoing.account_id = incoming.target_account
              AND outgoing.target_account = incoming.account_id
              AND outgoing.operation = 'set'
              AND outgoing.block_timestamp >= j.joined_at_ns::numeric
             WHERE incoming.operation = 'set'
               AND incoming.block_timestamp >= j.joined_at_ns::numeric
             GROUP BY incoming.target_account`
          : `SELECT
               incoming.target_account AS account_id,
               COUNT(DISTINCT incoming.account_id)::text AS received_stands,
               COUNT(DISTINCT incoming.account_id)
                 FILTER (WHERE outgoing.account_id IS NOT NULL)::text AS mutual_stands
             FROM standings_current incoming
             LEFT JOIN standings_current outgoing
               ON outgoing.account_id = incoming.target_account
              AND outgoing.target_account = incoming.account_id
             WHERE incoming.target_account = ANY($1::text[])
             GROUP BY incoming.target_account`,
      hasCutoff ? [accounts, cutoffParam] : scoreAfterJoin ? [...joinWindowParams] : [accounts]
    ),
    indexerQuery<SupportRow>(
      scoreAfterJoin
        ? `SELECT
             COALESCE(NULLIF(s.recipient_id, ''), s.target_id) AS account_id,
             SUM(s.target_amount::numeric)::text AS support_received_yocto
           FROM social_spend_events s
           INNER JOIN UNNEST($1::text[], $2::text[]) AS j(account_id, joined_at_ns)
             ON j.account_id = COALESCE(NULLIF(s.recipient_id, ''), s.target_id)
           WHERE s.event_type = 'SOCIAL_SPENT'
             AND s.success = true
             AND s.action = 'support_profile'
             AND s.target_type = 'profile'
             AND s.block_timestamp >= j.joined_at_ns::numeric
           GROUP BY COALESCE(NULLIF(s.recipient_id, ''), s.target_id)`
        : `SELECT
             COALESCE(NULLIF(recipient_id, ''), target_id) AS account_id,
             SUM(target_amount::numeric)::text AS support_received_yocto
           FROM social_spend_events
           WHERE event_type = 'SOCIAL_SPENT'
             AND success = true
             AND action = 'support_profile'
             AND target_type = 'profile'
             AND COALESCE(NULLIF(recipient_id, ''), target_id) = ANY($1::text[])
             ${hasCutoff ? 'AND block_timestamp <= $2::numeric' : ''}
           GROUP BY COALESCE(NULLIF(recipient_id, ''), target_id)`,
      scoreAfterJoin
        ? [...joinWindowParams]
        : hasCutoff
          ? [accounts, cutoffParam]
          : [accounts]
    ),
    indexerQuery<BoostRow>(
      hasCutoff || scoreAfterJoin
        ? `SELECT
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
             INNER JOIN UNNEST($1::text[], $2::text[]) AS j(account_id, joined_at_ns)
               ON j.account_id = be.account_id
             WHERE be.success = true
               AND be.event_type IN ('BOOST_LOCK', 'BOOST_EXTEND', 'BOOST_UNLOCK')
               AND be.block_timestamp ${
                 hasCutoff ? '<= $3::numeric' : '>= j.joined_at_ns::numeric'
               }
             ORDER BY be.account_id, be.block_height DESC, be.block_timestamp DESC, be.receipt_id DESC, be.id DESC
           ) latest_boost`
        : `SELECT account_id, effective_boost
           FROM booster_state
           WHERE account_id = ANY($1::text[])`,
      hasCutoff
        ? [accounts, joinedAtNs, cutoffParam]
        : scoreAfterJoin
          ? [...joinWindowParams]
          : [accounts]
    ),
  ]);

  const profileByAccount = profileSignals(profiles.rows);
  const endorsementByAccount = endorsementSignals(endorsements.rows);
  const standByAccount = new Map(
    stands.rows.map((row) => [row.account_id, row])
  );
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
      const endorsement = endorsementByAccount.get(row.account_id) ?? {
        uniqueEndorsers: 0,
        endorsementTopics: 0,
      };
      const stand = standByAccount.get(row.account_id);
      const supportReceivedYocto = supportByAccount.get(row.account_id) ?? '0';
      const effectiveBoostYocto = boostByAccount.get(row.account_id) ?? '0';
      const scored = scoreSeasonZero({
        accountId: row.account_id,
        joinAmountYocto: row.join_amount_yocto,
        profile,
        uniqueEndorsers: endorsement.uniqueEndorsers,
        endorsementTopics: endorsement.endorsementTopics,
        receivedStands: toNumber(stand?.received_stands),
        mutualStands: toNumber(stand?.mutual_stands),
        supportReceivedYocto,
        effectiveBoostYocto,
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
          uniqueEndorsers: endorsement.uniqueEndorsers,
          endorsementTopics: endorsement.endorsementTopics,
          receivedStands: toNumber(stand?.received_stands),
          mutualStands: toNumber(stand?.mutual_stands),
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
    seasonId: SEASON_ZERO_ID,
    limit,
    offset,
    total: rankedStandings.length,
    standings: page,
  };
}
