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
  EndorsementRecord,
  MediaRef,
  RelayResponse,
} from '@onsocial/sdk';
import {
  isEndorsementUploadFile,
  parseEndorsementMediaRef,
  resolveEndorsementDisplayMediaUrl,
} from '@/lib/endorsement-media';
import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';

/** Portal write payload — `previousTopic` enables move-on-edit. */
export type EndorsementSubmitInput = EndorsementBuildInput & {
  previousTopic?: string;
};

/** Result of a confirmed endorsement write (`wait: true`) plus chain read-back. */
export type EndorsementWriteResult = {
  response: RelayResponse;
  /** Post-write chain record — source of truth until the indexer catches up. */
  record: EndorsementRecord | null;
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

/** Optimistic list media after submit — handles File uploads and cid fallback. */
export function buildEndorsementOptimisticMedia(
  buildInput: EndorsementBuildInput,
  editing: { media?: unknown; mediaUrl?: string | null } | null | undefined,
  options?: { previewUrl?: string | null }
): { media?: MediaRef; mediaUrl: string | null } {
  if (buildInput.media === null) {
    return { mediaUrl: null };
  }

  const parsedInput = parseEndorsementMediaRef(buildInput.media);
  if (parsedInput) {
    return {
      media: parsedInput,
      mediaUrl: resolveEndorsementDisplayMediaUrl(
        { media: parsedInput },
        ACTIVE_NEAR_NETWORK
      ),
    };
  }

  if (isEndorsementUploadFile(buildInput.media) && options?.previewUrl) {
    return { mediaUrl: options.previewUrl };
  }

  const parsedEditing = parseEndorsementMediaRef(editing?.media);
  const mediaUrl = resolveEndorsementDisplayMediaUrl(
    { media: editing?.media, mediaUrl: editing?.mediaUrl },
    ACTIVE_NEAR_NETWORK
  );
  if (parsedEditing || mediaUrl) {
    return {
      ...(parsedEditing ? { media: parsedEditing } : {}),
      mediaUrl,
    };
  }

  return { mediaUrl: null };
}

/** Merge a confirmed on-chain endorsement into list UI shape. */
export function buildEndorsementListItemFromChain(
  record: EndorsementRecord,
  issuer: string,
  extras: {
    issuerName?: string | null;
    issuerAvatarUrl?: string | null;
    targetName?: string | null;
    targetAvatarUrl?: string | null;
  } = {}
): EndorsementListItem & { mediaUrl: string | null } {
  return {
    issuer,
    target: record.target,
    v: record.v,
    since: record.since,
    topic: record.topic,
    note: record.note,
    id: record.id,
    media: record.media,
    editedAt: record.editedAt,
    expiresAt: record.expiresAt,
    blockHeight: 0,
    blockTimestamp: Date.now(),
    mediaUrl: resolveEndorsementDisplayMediaUrl(
      { media: record.media },
      ACTIVE_NEAR_NETWORK
    ),
    ...extras,
  };
}

type EndorsementListItemExtras = {
  issuerName?: string | null;
  issuerAvatarUrl?: string | null;
  targetName?: string | null;
  targetAvatarUrl?: string | null;
};

/**
 * Prefer confirmed on-chain read-back; fall back to submit payload for UI until
 * indexer/refetch catches up (same idea as standing ledger overrides).
 */
export function buildEndorsementListItemAfterWrite(
  chainRecord: EndorsementRecord | null,
  issuer: string,
  target: string,
  buildInput: EndorsementBuildInput,
  editing: { media?: unknown; mediaUrl?: string | null } | null | undefined,
  extras: EndorsementListItemExtras = {},
  options?: { previewUrl?: string | null }
): EndorsementListItem & { mediaUrl: string | null } {
  if (chainRecord) {
    return buildEndorsementListItemFromChain(chainRecord, issuer, extras);
  }

  return {
    issuer,
    target,
    v: 1,
    since: Date.now(),
    topic: buildInput.topic,
    note: buildInput.note,
    expiresAt: buildInput.expiresAt,
    ...(typeof buildInput.id === 'string' ? { id: buildInput.id } : {}),
    ...buildEndorsementOptimisticMedia(buildInput, editing, options),
    blockHeight: 0,
    blockTimestamp: Date.now(),
    ...extras,
  };
}

/**
 * Action verb for a button label, e.g. "Endorse @bob for Rust".
 */
export function endorsementActionFullLabel(account: string): string {
  return `Endorse @${account}`;
}

export function cleanHandle(accountId: string): string {
  return accountId
    .replace(/\.onsocial\.(testnet|near|tg)$/u, '')
    .replace(/\.(testnet|near|tg)$/u, '');
}

export function endorsementPartyName(
  accountId: string,
  name?: string | null,
  viewerAccountId?: string | null
): string {
  if (viewerAccountId && accountId === viewerAccountId) return 'You';
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return cleanHandle(accountId);
}

export function endorsementPartyAt(
  accountId: string,
  viewerAccountId?: string | null
): string {
  if (viewerAccountId && accountId === viewerAccountId) return 'you';
  return accountId ? `@${accountId}` : '';
}

/** Profile name for attribution — matches list-card fallback order. */
export function resolveEndorsementPartyDisplayName(
  accountId: string,
  enrichedName: string | null | undefined,
  pageAccountId: string,
  pageDisplayName: string
): string {
  const trimmed = enrichedName?.trim();
  if (trimmed) return trimmed;
  if (accountId === pageAccountId) return pageDisplayName;
  return cleanHandle(accountId);
}

/** List-card names — page profile gets display-name fallback as issuer or target. */
export function resolveEndorsementListPartyNames(
  record: {
    issuer: string;
    target: string;
    issuerName?: string | null;
    targetName?: string | null;
  },
  pageAccountId: string,
  pageDisplayName: string
): { issuerName: string | null; targetName: string | null } {
  const issuerTrimmed = record.issuerName?.trim();
  const targetTrimmed = record.targetName?.trim();
  return {
    issuerName:
      issuerTrimmed ||
      (record.issuer === pageAccountId ? pageDisplayName : null),
    targetName:
      targetTrimmed ||
      (record.target === pageAccountId ? pageDisplayName : null),
  };
}

export type EndorsementListPartyContext = {
  pageAccountId: string;
  pageDisplayName: string;
  pageAvatarUrl?: string | null;
  viewerAccountId?: string | null;
  viewerAvatarUrl?: string | null;
};

function resolveEndorsementPartyAvatarUrl(
  accountId: string,
  enrichedAvatarUrl: string | null | undefined,
  context: Pick<
    EndorsementListPartyContext,
    'pageAccountId' | 'pageAvatarUrl' | 'viewerAccountId' | 'viewerAvatarUrl'
  >
): string | null {
  const trimmed = enrichedAvatarUrl?.trim();
  if (trimmed) return trimmed;
  if (
    context.viewerAccountId &&
    accountId === context.viewerAccountId &&
    context.viewerAvatarUrl?.trim()
  ) {
    return context.viewerAvatarUrl.trim();
  }
  if (accountId === context.pageAccountId && context.pageAvatarUrl?.trim()) {
    return context.pageAvatarUrl.trim();
  }
  return null;
}

/** Symmetric avatar fallback — enriched, then viewer, then page profile. */
export function resolveEndorsementListPartyAvatars(
  record: {
    issuer: string;
    target: string;
    issuerAvatarUrl?: string | null;
    targetAvatarUrl?: string | null;
  },
  context: Pick<
    EndorsementListPartyContext,
    'pageAccountId' | 'pageAvatarUrl' | 'viewerAccountId' | 'viewerAvatarUrl'
  >
): { issuerAvatarUrl: string | null; targetAvatarUrl: string | null } {
  return {
    issuerAvatarUrl: resolveEndorsementPartyAvatarUrl(
      record.issuer,
      record.issuerAvatarUrl,
      context
    ),
    targetAvatarUrl: resolveEndorsementPartyAvatarUrl(
      record.target,
      record.targetAvatarUrl,
      context
    ),
  };
}

/** Names + avatars for list cards and compose preview. */
export function resolveEndorsementListPartyDisplay(
  record: {
    issuer: string;
    target: string;
    issuerName?: string | null;
    targetName?: string | null;
    issuerAvatarUrl?: string | null;
    targetAvatarUrl?: string | null;
  },
  context: EndorsementListPartyContext
): {
  issuerName: string | null;
  targetName: string | null;
  issuerAvatarUrl: string | null;
  targetAvatarUrl: string | null;
} {
  return {
    ...resolveEndorsementListPartyNames(
      record,
      context.pageAccountId,
      context.pageDisplayName
    ),
    ...resolveEndorsementListPartyAvatars(record, context),
  };
}

type EndorsementSearchRecord = {
  issuer: string;
  target: string;
  issuerName?: string | null;
  targetName?: string | null;
  topic?: string | null;
  note?: string | null;
};

/** Client-side filter — both parties, names, handles, topics, and notes. */
export function endorsementMatchesLocalSearch(
  record: EndorsementSearchRecord,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const parts = [
    record.issuer,
    record.target,
    cleanHandle(record.issuer),
    cleanHandle(record.target),
    record.issuerName?.trim(),
    record.targetName?.trim(),
    record.topic ?? '',
    humanizeEndorsementTopic(record.topic ?? undefined),
    record.note ?? '',
  ];

  return parts.some((part) => part && part.toLowerCase().includes(q));
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
