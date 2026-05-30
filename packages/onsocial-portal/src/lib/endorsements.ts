// ---------------------------------------------------------------------------
// Endorsement metadata helpers
//
// Endorsements are intentionally binary in the product UI: you either put your
// name behind someone for a topic, or you do not. Signal strength should be
// derived later from issuer reputation, topic fit, freshness, graph quality,
// and optional stake-backed flows, not from a manual rating picker.
// ---------------------------------------------------------------------------

import type {
  EndorsementBuildInput,
  EndorsementListItem,
  RelayResponse,
} from '@onsocial/sdk';

/** Portal write payload — `previousTopic` enables move-on-edit. */
export type EndorsementSubmitInput = EndorsementBuildInput & {
  previousTopic?: string;
};

export class EndorsementTopicConflictError extends Error {
  readonly code = 'ENDORSEMENT_TOPIC_CONFLICT';

  constructor(
    public readonly target: string,
    public readonly topic: string
  ) {
    super(
      `You already endorsed ${target} for ${topic}. Edit that endorsement instead.`
    );
    this.name = 'EndorsementTopicConflictError';
  }
}

type EndorsementWriter = {
  add: (
    target: string,
    input?: EndorsementBuildInput,
    opts?: { wait?: boolean }
  ) => Promise<RelayResponse>;
  remove: (
    target: string,
    opts?: { topic?: string; wait?: boolean }
  ) => Promise<RelayResponse>;
  get: (
    target: string,
    opts?: { topic?: string; issuer?: string }
  ) => Promise<{ target: string } | null>;
};

/**
 * Add or update an endorsement. When `previousTopic` is set and the normalized
 * topic changes, withdraws the old path before writing the new one.
 */
export async function upsertEndorsement(
  endorsements: EndorsementWriter,
  target: string,
  input: EndorsementBuildInput,
  opts: {
    previousTopic?: string;
    wait?: boolean;
    /** Connected account — required for on-chain conflict checks via the proxy. */
    accountId?: string;
  } = {}
): Promise<RelayResponse> {
  const newTopic = normalizeEndorsementTopic(input.topic ?? '');
  const prevTopic = normalizeEndorsementTopic(opts.previousTopic ?? '');
  const topicMoved = opts.previousTopic !== undefined && prevTopic !== newTopic;

  if (topicMoved) {
    const existingAtNew = opts.accountId
      ? await endorsements.get(target, {
          topic: input.topic,
          issuer: opts.accountId,
        })
      : null;
    if (existingAtNew) {
      throw new EndorsementTopicConflictError(target, newTopic || 'general');
    }

    const wait = opts.wait === true;
    await endorsements.remove(target, { topic: opts.previousTopic, wait });
    return endorsements.add(target, input, wait ? { wait: true } : undefined);
  }

  return endorsements.add(
    target,
    input,
    opts.wait ? { wait: true } : undefined
  );
}

export function mergeEndorsementsAfterUpsert<T extends EndorsementListItem>(
  list: readonly T[],
  opts: {
    issuer: string;
    target: string;
    previousTopic?: string;
    next: T;
  }
): T[] {
  const newTopic = normalizeEndorsementTopic(opts.next.topic ?? '');
  const prevTopic = normalizeEndorsementTopic(opts.previousTopic ?? '');
  return [
    opts.next,
    ...list.filter((item) => {
      if (item.issuer !== opts.issuer || item.target !== opts.target) {
        return true;
      }
      const itemTopic = normalizeEndorsementTopic(item.topic ?? '');
      if (itemTopic === newTopic) return false;
      if (prevTopic && itemTopic === prevTopic && prevTopic !== newTopic) {
        return false;
      }
      return true;
    }),
  ];
}

/**
 * Action verb for a button label, e.g. "Endorse @bob for Rust".
 */
export function endorsementActionFullLabel(account: string): string {
  return `Endorse @${account}`;
}

export function cleanHandle(accountId: string): string {
  return accountId
    .replace(/\.onsocial\.(testnet|near)$/u, '')
    .replace(/\.(testnet|near)$/u, '');
}

export function normalizeEndorsementTopic(topic: string): string {
  return topic
    .trim()
    .replace(/\s+/gu, '-')
    .replace(/[^A-Za-z0-9_.-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '')
    .slice(0, 40);
}

export function humanizeEndorsementTopic(topic?: string): string {
  return (topic ?? '').trim().replace(/[-_]+/gu, ' ').replace(/\s+/gu, ' ');
}

export function normalizeEndorsementTimestamp(value?: number): number | null {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  if (value > 1_000_000_000_000_000) return Math.floor(value / 1_000_000);
  if (value < 1_000_000_000_000) return value * 1000;
  return value;
}

export function endorsementTimestamp(
  endorsement: EndorsementListItem
): number | null {
  return (
    normalizeEndorsementTimestamp(endorsement.blockTimestamp) ??
    normalizeEndorsementTimestamp(endorsement.since)
  );
}

export function formatEndorsementTime(timestamp: number | null): string {
  if (!timestamp) return '';
  const diff = Math.max(0, Date.now() - timestamp);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

/**
 * Top topics by endorsement count. Used in profile summary.
 */
export interface TopicCount {
  topic: string;
  label: string;
  count: number;
}

export function topTopics(
  endorsements: readonly EndorsementListItem[],
  limit = 3
): TopicCount[] {
  const counts = new Map<string, TopicCount>();
  for (const e of endorsements) {
    const raw = (e.topic ?? '').trim();
    if (!raw) continue;
    const normalized = normalizeEndorsementTopic(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    const current = counts.get(key);
    counts.set(key, {
      topic: current?.topic ?? normalized,
      label: current?.label ?? humanizeEndorsementTopic(raw),
      count: (current?.count ?? 0) + 1,
    });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
