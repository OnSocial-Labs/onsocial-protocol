import {
  formatTickerDisplay,
  homeFeedFocusKey,
  type HomeFeedFocus,
} from '@/features/home/home-feed-focus';

export type HomeSavedFeed = {
  id: string;
  kind: 'hashtag' | 'ticker';
  value: string;
  createdAt: number;
};

/** Device-only — not written on-chain. */
export const HOME_SAVED_FEEDS_STORAGE_KEY = 'onsocial.home.saved-feeds';

export const HOME_SAVED_FEEDS_MAX = 16;

export function homeSavedFeedFocus(feed: HomeSavedFeed): HomeFeedFocus {
  return { kind: feed.kind, value: feed.value };
}

export function homeSavedFeedLabel(feed: HomeSavedFeed): string {
  return feed.kind === 'ticker'
    ? formatTickerDisplay(feed.value)
    : `#${feed.value}`;
}

export function homeSavedFeedDescription(feed: HomeSavedFeed): string {
  return feed.kind === 'ticker' ? 'Ticker feed' : 'Topic feed';
}

export function upsertHomeSavedFeedList(
  feeds: HomeSavedFeed[],
  focus: HomeFeedFocus,
  now = Date.now()
): HomeSavedFeed[] {
  const key = homeFeedFocusKey(focus);
  const existing = feeds.find(
    (feed) => homeFeedFocusKey(homeSavedFeedFocus(feed)) === key
  );
  const next = existing
    ? [existing, ...feeds.filter((feed) => feed.id !== existing.id)]
    : [
        {
          id: createSavedFeedId(),
          kind: focus.kind,
          value: focus.value,
          createdAt: now,
        },
        ...feeds,
      ];
  return next.slice(0, HOME_SAVED_FEEDS_MAX);
}

export function removeHomeSavedFeedFromList(
  feeds: HomeSavedFeed[],
  id: string
): HomeSavedFeed[] {
  return feeds.filter((feed) => feed.id !== id);
}

export function readHomeSavedFeeds(): HomeSavedFeed[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HOME_SAVED_FEEDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeSavedFeed)
      .filter((feed): feed is HomeSavedFeed => feed != null)
      .slice(0, HOME_SAVED_FEEDS_MAX);
  } catch {
    return [];
  }
}

export function writeHomeSavedFeeds(feeds: HomeSavedFeed[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      HOME_SAVED_FEEDS_STORAGE_KEY,
      JSON.stringify(feeds.slice(0, HOME_SAVED_FEEDS_MAX))
    );
  } catch {
    /* private mode / denied */
  }
}

export function addHomeSavedFeed(focus: HomeFeedFocus): HomeSavedFeed[] {
  const next = upsertHomeSavedFeedList(readHomeSavedFeeds(), focus);
  writeHomeSavedFeeds(next);
  return next;
}

export function removeHomeSavedFeed(id: string): HomeSavedFeed[] {
  const next = removeHomeSavedFeedFromList(readHomeSavedFeeds(), id);
  writeHomeSavedFeeds(next);
  return next;
}

function createSavedFeedId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `feed-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeSavedFeed(value: unknown): HomeSavedFeed | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<HomeSavedFeed>;
  if (typeof row.id !== 'string' || !row.id) return null;
  if (row.kind !== 'hashtag' && row.kind !== 'ticker') return null;
  if (typeof row.value !== 'string' || !row.value) return null;
  return {
    id: row.id,
    kind: row.kind,
    value: row.value,
    createdAt:
      typeof row.createdAt === 'number' && Number.isFinite(row.createdAt)
        ? row.createdAt
        : 0,
  };
}
