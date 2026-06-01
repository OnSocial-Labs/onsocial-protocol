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

const ENDORSER_POINTS = 50;
const ENDORSER_CAP = 8;
const ENDORSEMENT_TOPIC_POINTS = 25;
const ENDORSEMENT_TOPIC_CAP = 4;

const RECEIVED_STAND_POINTS = 25;
const RECEIVED_STAND_CAP = 10;
const MUTUAL_STAND_POINTS = 30;
const MUTUAL_STAND_CAP = 5;
const SOLIDARITY_CAP = 300;

const SUPPORT_SQRT_POINTS = 80;
const SUPPORT_CAP = 300;
const BOOST_SQRT_POINTS = 60;
const BOOST_CAP = 300;

export interface SeasonZeroProfileSignals {
  hasName: boolean;
  hasBio: boolean;
  hasAvatar: boolean;
  linkCount: number;
}

export interface SeasonZeroSignals {
  accountId: string;
  joinAmountYocto: string | bigint;
  profile: SeasonZeroProfileSignals;
  uniqueEndorsers: number;
  endorsementTopics: number;
  receivedStands: number;
  mutualStands: number;
  supportReceivedYocto: string | bigint;
  effectiveBoostYocto: string | bigint;
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
  const join = eligible ? 1_000 : 0;
  const profile = eligible ? scoreSeasonZeroProfile(input.profile) : 0;
  const endorsements = eligible
    ? clampCount(input.uniqueEndorsers, ENDORSER_CAP) * ENDORSER_POINTS +
      clampCount(input.endorsementTopics, ENDORSEMENT_TOPIC_CAP) *
        ENDORSEMENT_TOPIC_POINTS
    : 0;
  const solidarity = eligible
    ? Math.min(
        clampCount(input.receivedStands, RECEIVED_STAND_CAP) *
          RECEIVED_STAND_POINTS +
          clampCount(input.mutualStands, MUTUAL_STAND_CAP) *
            MUTUAL_STAND_POINTS,
        SOLIDARITY_CAP
      )
    : 0;
  const support = eligible
    ? cappedSqrtSignal(
        input.supportReceivedYocto,
        SUPPORT_SQRT_POINTS,
        SUPPORT_CAP
      )
    : 0;
  const boost = eligible
    ? cappedSqrtSignal(input.effectiveBoostYocto, BOOST_SQRT_POINTS, BOOST_CAP)
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
