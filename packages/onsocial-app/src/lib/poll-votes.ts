/** On-chain poll votes: `pollvote/<postOwner>/post/<postId>` (writer = voter). */

export const POLL_VOTE_DATA_TYPE = 'pollvote';

export interface PollVoteValue {
  v: 1;
  optionIndex: number;
  timestamp: number;
}

export interface PollVoteRow {
  accountId: string;
  path: string;
  value: string;
  blockHeight: number;
  operation: string;
}

export interface PollTally {
  /** Votes per option index. */
  counts: number[];
  total: number;
  /** Viewer's selected option index, or null. */
  viewerOptionIndex: number | null;
}

export function pollVoteWritePath(postOwner: string, postId: string): string {
  return `${POLL_VOTE_DATA_TYPE}/${postOwner}/post/${postId}`;
}

export function pollVoteStateKey(postOwner: string, postId: string): string {
  return `${postOwner}:${postId}`;
}

/** Parse `{voter}/pollvote/{owner}/post/{postId}` → owner + postId. */
export function parsePollVotePath(
  path: string
): { owner: string; postId: string } | null {
  const parts = path.split('/').filter(Boolean);
  // Indexed paths include the writer account as the first segment.
  const offset = parts[1] === POLL_VOTE_DATA_TYPE ? 1 : 0;
  if (parts[offset] !== POLL_VOTE_DATA_TYPE) return null;
  if (parts[offset + 2] !== 'post') return null;
  const owner = parts[offset + 1];
  const postId = parts[offset + 3];
  if (!owner || !postId) return null;
  return { owner, postId };
}

export function parsePollVoteValue(value: unknown): PollVoteValue | null {
  try {
    const parsed =
      typeof value === 'string'
        ? (JSON.parse(value) as Record<string, unknown>)
        : value && typeof value === 'object'
          ? (value as Record<string, unknown>)
          : null;
    if (!parsed) return null;
    if (
      typeof parsed.optionIndex !== 'number' ||
      !Number.isInteger(parsed.optionIndex) ||
      parsed.optionIndex < 0
    ) {
      return null;
    }
    return {
      v: 1,
      optionIndex: parsed.optionIndex,
      timestamp:
        typeof parsed.timestamp === 'number' && Number.isFinite(parsed.timestamp)
          ? parsed.timestamp
          : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Keep the latest row per voter+path, then tally option indexes for each poll.
 * `optionCount` is required so out-of-range votes are dropped.
 */
export function tallyPollVotes(
  rows: PollVoteRow[],
  polls: { owner: string; postId: string; optionCount: number }[],
  viewer?: string | null
): Record<string, PollTally> {
  const wanted = new Map(
    polls.map((poll) => [
      pollVoteStateKey(poll.owner, poll.postId),
      poll.optionCount,
    ])
  );
  const out: Record<string, PollTally> = {};
  for (const [key, optionCount] of wanted) {
    out[key] = {
      counts: Array.from({ length: optionCount }, () => 0),
      total: 0,
      viewerOptionIndex: null,
    };
  }

  const latest = new Map<string, PollVoteRow>();
  const sorted = [...rows].sort((a, b) => b.blockHeight - a.blockHeight);
  for (const row of sorted) {
    const dedupeKey = `${row.accountId}\0${row.path}`;
    if (latest.has(dedupeKey)) continue;
    latest.set(dedupeKey, row);
  }

  for (const row of latest.values()) {
    if (row.operation !== 'set') continue;
    const target = parsePollVotePath(row.path);
    if (!target) continue;
    const key = pollVoteStateKey(target.owner, target.postId);
    const tally = out[key];
    if (!tally) continue;
    const vote = parsePollVoteValue(row.value);
    if (!vote || vote.optionIndex >= tally.counts.length) continue;

    tally.counts[vote.optionIndex] += 1;
    tally.total += 1;
    if (viewer && row.accountId === viewer) {
      tally.viewerOptionIndex = vote.optionIndex;
    }
  }

  return out;
}

export function emptyPollTally(optionCount: number): PollTally {
  return {
    counts: Array.from({ length: Math.max(optionCount, 0) }, () => 0),
    total: 0,
    viewerOptionIndex: null,
  };
}

/**
 * Largest-remainder percentages that always sum to 100 when there are votes.
 */
export function distributePollPercents(
  counts: number[],
  total: number
): number[] {
  if (counts.length === 0) return [];
  if (total <= 0) return counts.map(() => 0);

  const exact = counts.map((count) => (Math.max(0, count) / total) * 100);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - floors[index]! }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  const out = [...floors];
  for (let i = 0; i < remainder; i += 1) {
    const target = order[i % order.length];
    if (!target) break;
    out[target.index] = (out[target.index] ?? 0) + 1;
  }
  return out;
}
