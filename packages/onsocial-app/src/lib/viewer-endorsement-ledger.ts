import { endorsementTopicKey } from '@/lib/endorsement-display';
import type {
  EndorsementPanelItem,
  EndorsementsMode,
} from '@/lib/endorsements-panel-data';

/** Minimal profile shell for injecting confirmed vouches into stale list reads. */
export type EndorsementListSnapshot = {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
};

export type ViewerEndorsementDraft = {
  topic: string;
  note: string | null;
  id: string | null;
};

export type ViewerEndorsementLedgerEntry = {
  /** Normalized topic keys. Empty = confirmed unendorsed until API agrees. */
  topics: string[];
  /**
   * Last known API topic set for this target when the override was created.
   * Empty when the viewer originated the vouch before the indexer saw it.
   */
  apiTopics: string[];
  latest?: ViewerEndorsementDraft;
  snapshot?: EndorsementListSnapshot;
};

export type PortfolioEndorsementCounts = {
  received: number;
  given: number;
};

/** Confirmed endorsement overrides until read APIs catch up. */
export type ViewerEndorsementLedger = Map<string, ViewerEndorsementLedgerEntry>;

export function normalizeEndorsementLedgerTopic(
  topic?: string | null
): string {
  return endorsementTopicKey(topic);
}

function accountKey(accountId: string): string {
  return accountId.trim().toLowerCase();
}

export function findEndorsementLedgerKey(
  ledger: ViewerEndorsementLedger,
  accountId: string
): string | undefined {
  const normalized = accountKey(accountId);
  if (!normalized) return undefined;
  for (const key of ledger.keys()) {
    if (accountKey(key) === normalized) return key;
  }
  return undefined;
}

function findLedgerEntry(
  ledger: ViewerEndorsementLedger,
  accountId: string
): ViewerEndorsementLedgerEntry | undefined {
  const key = findEndorsementLedgerKey(ledger, accountId);
  return key ? ledger.get(key) : undefined;
}

function resolveLedgerWriteKey(
  ledger: ViewerEndorsementLedger,
  accountId: string
): string {
  return findEndorsementLedgerKey(ledger, accountId) ?? accountId;
}

function uniqueTopics(topics: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const topic of topics) {
    if (seen.has(topic)) continue;
    seen.add(topic);
    next.push(topic);
  }
  return next;
}

function topicsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((topic) => rightSet.has(topic));
}

function clampCount(value: number): number {
  return Math.max(0, value);
}

export function entryIsEndorsed(
  entry: ViewerEndorsementLedgerEntry | undefined
): boolean {
  return Boolean(entry && entry.topics.length > 0);
}

export function recordViewerEndorse(
  ledger: ViewerEndorsementLedger,
  targetAccountId: string,
  topic?: string | null,
  options?: {
    previousTopic?: string | null;
    snapshot?: EndorsementListSnapshot;
    draft?: ViewerEndorsementDraft;
  }
): void {
  const key = resolveLedgerWriteKey(ledger, targetAccountId);
  const previous = ledger.get(key);
  const nextTopic = normalizeEndorsementLedgerTopic(topic);
  const previousTopic =
    options?.previousTopic === undefined
      ? undefined
      : normalizeEndorsementLedgerTopic(options.previousTopic);

  let topics = [...(previous?.topics ?? [])];
  if (previousTopic !== undefined && previousTopic !== nextTopic) {
    topics = topics.filter((item) => item !== previousTopic);
  }
  if (!topics.includes(nextTopic)) {
    topics.push(nextTopic);
  }

  ledger.set(key, {
    topics: uniqueTopics(topics),
    apiTopics: previous?.apiTopics ?? [],
    snapshot: options?.snapshot ?? previous?.snapshot,
    latest: options?.draft ?? previous?.latest,
  });
}

export function recordViewerEndorseRemove(
  ledger: ViewerEndorsementLedger,
  targetAccountId: string,
  topic?: string | null
): void {
  const key = resolveLedgerWriteKey(ledger, targetAccountId);
  const previous = ledger.get(key);
  const removedTopic = normalizeEndorsementLedgerTopic(topic);
  const currentTopics = previous?.topics ?? [removedTopic];
  const topics = currentTopics.filter((item) => item !== removedTopic);

  ledger.set(key, {
    topics,
    apiTopics: previous?.apiTopics ?? (previous ? [] : [removedTopic]),
    snapshot: previous?.snapshot,
    latest: previous?.latest,
  });
}

export function resolveViewerEndorsed(
  ledger: ViewerEndorsementLedger,
  targetAccountId: string,
  apiEndorsed: boolean
): boolean {
  const entry = findLedgerEntry(ledger, targetAccountId);
  if (!entry) return apiEndorsed;
  return entryIsEndorsed(entry);
}

export function reconcileViewerEndorsement(
  ledger: ViewerEndorsementLedger,
  targetAccountId: string,
  apiTopics: string[]
): boolean {
  const key = findEndorsementLedgerKey(ledger, targetAccountId);
  if (!key) return false;
  const entry = ledger.get(key);
  if (!entry) return false;
  const normalizedApi = uniqueTopics(
    apiTopics.map((topic) => normalizeEndorsementLedgerTopic(topic))
  );
  if (!topicsEqual(entry.topics, normalizedApi)) {
    return false;
  }
  return ledger.delete(key);
}

export function topicsFromEndorsementItems(
  items: Array<{ issuer: string; target: string; topic?: string | null }>,
  viewerAccountId: string,
  targetAccountId: string
): string[] {
  const viewer = accountKey(viewerAccountId);
  const target = accountKey(targetAccountId);
  const topics: string[] = [];
  for (const item of items) {
    if (accountKey(item.issuer) !== viewer) continue;
    if (accountKey(item.target) !== target) continue;
    topics.push(normalizeEndorsementLedgerTopic(item.topic));
  }
  return uniqueTopics(topics);
}

export function reconcileEndorsementListFromApi(
  ledger: ViewerEndorsementLedger,
  items: Array<{ issuer: string; target: string; topic?: string | null }>,
  viewerAccountId: string | null
): boolean {
  if (!viewerAccountId) return false;
  const targets = new Set<string>();
  for (const item of items) {
    if (accountKey(item.issuer) !== accountKey(viewerAccountId)) continue;
    targets.add(item.target);
  }

  let changed = false;
  for (const target of targets) {
    if (
      reconcileViewerEndorsement(
        ledger,
        target,
        topicsFromEndorsementItems(items, viewerAccountId, target)
      )
    ) {
      changed = true;
    }
  }
  return changed;
}

function topicDelta(
  entry: ViewerEndorsementLedgerEntry,
  apiTopics: string[]
): number {
  return (
    entry.topics.length -
    uniqueTopics(apiTopics.map((topic) => normalizeEndorsementLedgerTopic(topic)))
      .length
  );
}

/** Live portfolio / overlay counts — topic rows, matching the list. */
export function derivePortfolioEndorsementCounts({
  pageAccountId,
  viewerAccountId,
  counts,
  apiViewerEndorsed,
  apiViewerEndorsementTopics,
  viewerItems,
  ledger,
  relationshipKnown = true,
}: {
  pageAccountId: string;
  viewerAccountId: string | null;
  counts: PortfolioEndorsementCounts;
  apiViewerEndorsed: boolean;
  apiViewerEndorsementTopics?: string[];
  viewerItems?: Array<{ issuer: string; target: string; topic?: string | null }>;
  ledger: ViewerEndorsementLedger;
  relationshipKnown?: boolean;
}): PortfolioEndorsementCounts {
  if (!viewerAccountId) {
    return counts;
  }

  const pageId = accountKey(pageAccountId);
  const viewerId = accountKey(viewerAccountId);
  if (!pageId || !viewerId) {
    return counts;
  }

  let { received, given } = counts;

  if (pageId === viewerId) {
    for (const [targetAccountId, entry] of ledger) {
      const fromList = viewerItems
        ? topicsFromEndorsementItems(
            viewerItems,
            viewerAccountId,
            targetAccountId
          )
        : null;
      given += topicDelta(entry, fromList ?? entry.apiTopics);
    }
    return {
      received: clampCount(received),
      given: clampCount(given),
    };
  }

  if (!relationshipKnown) {
    return counts;
  }

  const entry = findLedgerEntry(ledger, pageAccountId);
  if (!entry) {
    return counts;
  }

  const apiTopics =
    apiViewerEndorsementTopics ??
    (apiViewerEndorsed ? entry.apiTopics : []);
  received += topicDelta(entry, apiTopics);
  return {
    received: clampCount(received),
    given: clampCount(given),
  };
}

function buildInjectedEndorsementItem({
  viewerAccountId,
  targetAccountId,
  topic,
  entry,
  now,
}: {
  viewerAccountId: string;
  targetAccountId: string;
  topic: string;
  entry: ViewerEndorsementLedgerEntry;
  now: number;
}): EndorsementPanelItem {
  const latestMatches =
    entry.latest &&
    normalizeEndorsementLedgerTopic(entry.latest.topic) === topic;
  return {
    issuer: viewerAccountId,
    target: targetAccountId,
    v: 1,
    since: now,
    ...(topic ? { topic } : {}),
    ...(latestMatches && entry.latest?.note
      ? { note: entry.latest.note }
      : {}),
    ...(latestMatches && entry.latest?.id ? { id: entry.latest.id } : {}),
    blockHeight: 0,
    blockTimestamp: now,
    issuerName: null,
    issuerAvatarUrl: null,
    targetName: entry.snapshot?.name ?? null,
    targetAvatarUrl: entry.snapshot?.avatarUrl ?? null,
    mediaUrl: null,
  };
}

function itemTopicKey(item: { topic?: string | null }): string {
  return normalizeEndorsementLedgerTopic(item.topic);
}

export function deriveEndorsementListItems({
  items,
  ledger,
  mode,
  listAccountId,
  viewerAccountId,
}: {
  items: EndorsementPanelItem[];
  ledger: ViewerEndorsementLedger;
  mode: EndorsementsMode;
  listAccountId: string;
  viewerAccountId: string | null;
}): {
  items: EndorsementPanelItem[];
  totalAdjustment: number;
} {
  if (!viewerAccountId || ledger.size === 0) {
    return { items, totalAdjustment: 0 };
  }

  const viewer = accountKey(viewerAccountId);
  const listId = accountKey(listAccountId);
  const now = Date.now();

  const derived = items.filter((item) => {
    if (accountKey(item.issuer) !== viewer) return true;
    const entry = findLedgerEntry(ledger, item.target);
    if (!entry) return true;
    if (!entryIsEndorsed(entry)) return false;
    return entry.topics.includes(itemTopicKey(item));
  });

  const seen = new Set(
    derived
      .filter((item) => accountKey(item.issuer) === viewer)
      .map((item) => `${accountKey(item.target)}:${itemTopicKey(item)}`)
  );

  const injected: EndorsementPanelItem[] = [];
  const shouldInjectGiven = mode === 'given' && listId === viewer;
  const shouldInjectReceived = mode === 'received';

  for (const [targetAccountId, entry] of ledger) {
    if (!entryIsEndorsed(entry)) continue;
    if (shouldInjectReceived && accountKey(targetAccountId) !== listId) {
      continue;
    }
    if (!shouldInjectGiven && !shouldInjectReceived) continue;

    for (const topic of entry.topics) {
      const token = `${accountKey(targetAccountId)}:${topic}`;
      if (seen.has(token)) continue;
      injected.push(
        buildInjectedEndorsementItem({
          viewerAccountId,
          targetAccountId,
          topic,
          entry,
          now,
        })
      );
      seen.add(token);
    }
  }

  if (injected.length === 0) {
    return {
      items: derived,
      totalAdjustment: derived.length - items.length,
    };
  }

  return {
    items: [...injected, ...derived],
    totalAdjustment: injected.length + derived.length - items.length,
  };
}

export function shouldFreshFetchEndorsementList(
  ledger: ViewerEndorsementLedger,
  listAccountId: string,
  viewerAccountId: string | null,
  mode: EndorsementsMode
): boolean {
  if (!viewerAccountId || ledger.size === 0) return false;
  if (mode === 'given') {
    return accountKey(listAccountId) === accountKey(viewerAccountId);
  }
  return Boolean(findLedgerEntry(ledger, listAccountId));
}

export function hasEndorsementLedgerOverride(
  ledger: ViewerEndorsementLedger,
  targetAccountId: string
): boolean {
  return Boolean(findLedgerEntry(ledger, targetAccountId));
}
