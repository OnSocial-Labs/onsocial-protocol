const YOCTO_PER_SOCIAL = 1_000_000_000_000_000_000n;

export const SEASON_ZERO_ID = 'season-zero';

export const SEASON_ZERO_JOIN_RALLY_SOCIAL = 100n;
export const SEASON_ZERO_JOIN_RALLY_MIN_YOCTO =
  SEASON_ZERO_JOIN_RALLY_SOCIAL * YOCTO_PER_SOCIAL;

const PROFILE_NAME_POINTS = 100;
const PROFILE_BIO_POINTS = 100;
const PROFILE_AVATAR_POINTS = 100;
const PROFILE_LINK_POINTS = 25;
const PROFILE_LINK_CAP = 2;

const JOIN_POINTS = 1_000;

const ENDORSER_POINTS = 50;
const ENDORSER_DAILY_CAP = 3;
const ENDORSER_SEASON_CAP = 40;

const ENDORSEMENT_TOPIC_POINTS = 25;
const TOPIC_DAILY_CAP = 2;
const TOPIC_SEASON_CAP = 20;

const RECEIVED_STAND_POINTS = 25;
const RECEIVED_STAND_DAILY_CAP = 4;
const RECEIVED_STAND_SEASON_CAP = 48;

const MUTUAL_STAND_POINTS = 30;
const MUTUAL_STAND_DAILY_CAP = 2;
const MUTUAL_STAND_SEASON_CAP = 24;

const SOLIDARITY_DAILY_CAP = 130;
const SOLIDARITY_SEASON_CAP = 1_200;

const SUPPORT_SQRT_POINTS = 80;
const SUPPORT_SEASON_CAP = 600;

const BOOST_SQRT_POINTS = 60;
const BOOST_SEASON_CAP = 600;

/** Exported for API + portal progress UI (keep in sync with scoring logic). */
export const SEASON_ZERO_SCORING_LIMITS = {
  join: { points: JOIN_POINTS },
  profile: {
    name: PROFILE_NAME_POINTS,
    bio: PROFILE_BIO_POINTS,
    avatar: PROFILE_AVATAR_POINTS,
    link: PROFILE_LINK_POINTS,
    linkCap: PROFILE_LINK_CAP,
    max:
      PROFILE_NAME_POINTS +
      PROFILE_BIO_POINTS +
      PROFILE_AVATAR_POINTS +
      PROFILE_LINK_CAP * PROFILE_LINK_POINTS,
  },
  endorsements: {
    endorserPoints: ENDORSER_POINTS,
    endorserDailyCap: ENDORSER_DAILY_CAP,
    endorserSeasonCap: ENDORSER_SEASON_CAP,
    topicPoints: ENDORSEMENT_TOPIC_POINTS,
    topicDailyCap: TOPIC_DAILY_CAP,
    topicSeasonCap: TOPIC_SEASON_CAP,
    max:
      ENDORSER_SEASON_CAP * ENDORSER_POINTS +
      TOPIC_SEASON_CAP * ENDORSEMENT_TOPIC_POINTS,
  },
  solidarity: {
    receivedPoints: RECEIVED_STAND_POINTS,
    receivedDailyCap: RECEIVED_STAND_DAILY_CAP,
    receivedSeasonCap: RECEIVED_STAND_SEASON_CAP,
    mutualPoints: MUTUAL_STAND_POINTS,
    mutualDailyCap: MUTUAL_STAND_DAILY_CAP,
    mutualSeasonCap: MUTUAL_STAND_SEASON_CAP,
    dailyCap: SOLIDARITY_DAILY_CAP,
    max: SOLIDARITY_SEASON_CAP,
  },
  support: {
    sqrtPoints: SUPPORT_SQRT_POINTS,
    max: SUPPORT_SEASON_CAP,
  },
  boost: {
    sqrtPoints: BOOST_SQRT_POINTS,
    max: BOOST_SEASON_CAP,
  },
  totalMax:
    JOIN_POINTS +
    PROFILE_NAME_POINTS +
    PROFILE_BIO_POINTS +
    PROFILE_AVATAR_POINTS +
    PROFILE_LINK_CAP * PROFILE_LINK_POINTS +
    ENDORSER_SEASON_CAP * ENDORSER_POINTS +
    TOPIC_SEASON_CAP * ENDORSEMENT_TOPIC_POINTS +
    SOLIDARITY_SEASON_CAP +
    SUPPORT_SEASON_CAP +
    BOOST_SEASON_CAP,
} as const;

export interface SeasonZeroProfileSignals {
  hasName: boolean;
  hasBio: boolean;
  hasAvatar: boolean;
  linkCount: number;
}

export interface SeasonZeroSocialDailySignals {
  endorsersByDay: number[];
  topicsByDay: number[];
  receivedStandsByDay: number[];
  mutualStandsByDay: number[];
}

export interface SeasonZeroSignals {
  accountId: string;
  joinAmountYocto: string | bigint;
  profile: SeasonZeroProfileSignals;
  /** Season-total counts (display / diagnostics). */
  uniqueEndorsers: number;
  endorsementTopics: number;
  receivedStands: number;
  mutualStands: number;
  supportReceivedYocto: string | bigint;
  effectiveBoostYocto: string | bigint;
  daily: SeasonZeroSocialDailySignals;
}

export interface SeasonZeroScoreBreakdown {
  join: number;
  profile: number;
  endorsements: number;
  solidarity: number;
  support: number;
  boost: number;
  total: number;
}

export interface SeasonZeroScore {
  accountId: string;
  eligible: boolean;
  breakdown: SeasonZeroScoreBreakdown;
}

function clampCount(value: number, cap: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), cap);
}

export function parseYoctoAmount(value: string | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (!/^\d+$/u.test(value)) return 0n;
  return BigInt(value);
}

function integerSqrt(value: bigint): bigint {
  if (value <= 0n) return 0n;
  if (value < 2n) return value;

  let left = 1n;
  let right = value;
  let answer = 1n;
  while (left <= right) {
    const mid = (left + right) / 2n;
    const squared = mid * mid;
    if (squared === value) return mid;
    if (squared < value) {
      answer = mid;
      left = mid + 1n;
    } else {
      right = mid - 1n;
    }
  }
  return answer;
}

function cappedSqrtSignal(
  yocto: string | bigint,
  pointsPerSqrtSocial: number,
  cap: number
): number {
  const wholeSocial = parseYoctoAmount(yocto) / YOCTO_PER_SOCIAL;
  const score = Number(integerSqrt(wholeSocial)) * pointsPerSqrtSocial;
  return Math.min(score, cap);
}

function scoreDailySeries(
  countsByDay: number[],
  perDayCap: number,
  pointsPer: number,
  seasonCap: number
): number {
  let total = 0;
  for (const count of countsByDay) {
    total += clampCount(count, perDayCap) * pointsPer;
  }
  return Math.min(total, seasonCap);
}

function scoreSolidarityDaily(
  receivedStandsByDay: number[],
  mutualStandsByDay: number[]
): number {
  const dayCount = Math.max(
    receivedStandsByDay.length,
    mutualStandsByDay.length
  );
  let total = 0;
  for (let index = 0; index < dayCount; index += 1) {
    const dayScore =
      clampCount(receivedStandsByDay[index] ?? 0, RECEIVED_STAND_DAILY_CAP) *
        RECEIVED_STAND_POINTS +
      clampCount(mutualStandsByDay[index] ?? 0, MUTUAL_STAND_DAILY_CAP) *
        MUTUAL_STAND_POINTS;
    total += Math.min(dayScore, SOLIDARITY_DAILY_CAP);
  }
  return Math.min(total, SOLIDARITY_SEASON_CAP);
}

export function scoreSeasonZeroProfile(
  profile: SeasonZeroProfileSignals
): number {
  return (
    (profile.hasName ? PROFILE_NAME_POINTS : 0) +
    (profile.hasBio ? PROFILE_BIO_POINTS : 0) +
    (profile.hasAvatar ? PROFILE_AVATAR_POINTS : 0) +
    clampCount(profile.linkCount, PROFILE_LINK_CAP) * PROFILE_LINK_POINTS
  );
}

export function scoreSeasonZero(input: SeasonZeroSignals): SeasonZeroScore {
  const joinAmountYocto = parseYoctoAmount(input.joinAmountYocto);
  const eligible = joinAmountYocto >= SEASON_ZERO_JOIN_RALLY_MIN_YOCTO;
  const join = eligible ? JOIN_POINTS : 0;
  const profile = eligible ? scoreSeasonZeroProfile(input.profile) : 0;

  const { daily } = input;
  const endorsements = eligible
    ? scoreDailySeries(
        daily.endorsersByDay,
        ENDORSER_DAILY_CAP,
        ENDORSER_POINTS,
        ENDORSER_SEASON_CAP * ENDORSER_POINTS
      ) +
      scoreDailySeries(
        daily.topicsByDay,
        TOPIC_DAILY_CAP,
        ENDORSEMENT_TOPIC_POINTS,
        TOPIC_SEASON_CAP * ENDORSEMENT_TOPIC_POINTS
      )
    : 0;

  const solidarity = eligible
    ? scoreSolidarityDaily(
        daily.receivedStandsByDay,
        daily.mutualStandsByDay
      )
    : 0;

  const support = eligible
    ? cappedSqrtSignal(
        input.supportReceivedYocto,
        SUPPORT_SQRT_POINTS,
        SUPPORT_SEASON_CAP
      )
    : 0;
  const boost = eligible
    ? cappedSqrtSignal(
        input.effectiveBoostYocto,
        BOOST_SQRT_POINTS,
        BOOST_SEASON_CAP
      )
    : 0;
  const total = join + profile + endorsements + solidarity + support + boost;

  return {
    accountId: input.accountId,
    eligible,
    breakdown: {
      join,
      profile,
      endorsements,
      solidarity,
      support,
      boost,
      total,
    },
  };
}
