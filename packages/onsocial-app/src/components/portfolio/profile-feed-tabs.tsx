'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  GiftIcon,
  ImageIcon,
  MessageRoundIcon,
  NoteTextIcon,
  RepeatIcon,
  StarsCIcon,
} from '@onsocial/ui';
import { OsChipRail } from '@/components/os/os-chip-rail';
import type { ProfileFeedTab } from '@/features/home/profile-feed-client';

const FEED_TAB_PARAM = 'tab';
export const SCARCES_VIEW_PARAM = 'scarcesView';

export function isProfileFeedTab(
  value: string | null
): value is ProfileFeedTab {
  return (
    value === 'posts' ||
    value === 'replies' ||
    value === 'reposts' ||
    value === 'media'
  );
}

/** Full portfolio rail — feed plus commerce tabs only. */
export type PortfolioRailTab =
  | ProfileFeedTab
  | 'scarces'
  | 'collection';

/** Legacy commerce tabs → unified Scarces drawer. Identity tabs live on the face. */
export function normalizePortfolioRailTab(
  value: string | null
): PortfolioRailTab | null {
  if (value === 'store' || value === 'drops') return 'scarces';
  if (value === 'guilds' || value === 'links') return null;
  return isPortfolioRailTab(value) ? value : null;
}

function isPortfolioRailTab(value: string | null): value is PortfolioRailTab {
  return (
    isProfileFeedTab(value) ||
    value === 'scarces' ||
    value === 'collection'
  );
}

/**
 * Tab state mirrored into `?tab=` so sections stay shareable.
 * Shallow `history.replaceState` — client state, no server trip.
 */
function useTabParamState<T extends string>(
  validate: (value: string | null) => value is T,
  defaultTab: T
): [T, (tab: T) => void] {
  const searchParams = useSearchParams();
  const fromUrl = normalizePortfolioRailTab(searchParams.get(FEED_TAB_PARAM));
  const [tab, setTab] = useState<T>(
    validate(fromUrl) ? fromUrl : defaultTab
  );

  const selectTab = useCallback(
    (next: T) => {
      setTab(next);
      const params = new URLSearchParams(window.location.search);
      if (next === defaultTab) {
        params.delete(FEED_TAB_PARAM);
        params.delete(SCARCES_VIEW_PARAM);
      } else {
        params.set(FEED_TAB_PARAM, next);
        if (next !== 'scarces') {
          params.delete(SCARCES_VIEW_PARAM);
        }
      }
      const qs = params.toString();
      const hash = window.location.hash;
      const base = window.location.pathname;
      window.history.replaceState(
        null,
        '',
        qs ? `${base}?${qs}${hash}` : `${base}${hash}`
      );
    },
    [defaultTab]
  );

  return [tab, selectTab];
}

export function usePortfolioRailTabParam(): [
  PortfolioRailTab,
  (tab: PortfolioRailTab) => void,
] {
  return useTabParamState<PortfolioRailTab>(isPortfolioRailTab, 'posts');
}

/** Valid `?tab=` in a query string — shared section links open the drawer. */
export function portfolioRailTabFromSearch(
  search: string
): PortfolioRailTab | null {
  const value = new URLSearchParams(search).get(FEED_TAB_PARAM);
  return normalizePortfolioRailTab(value);
}

/** Rewrite legacy drawer tab params (store, drops, guilds, links). */
export function normalizeLegacyPortfolioRailUrl(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const tab = params.get(FEED_TAB_PARAM);
  if (!tab) return;

  if (tab === 'guilds' || tab === 'links') {
    params.delete(FEED_TAB_PARAM);
    params.delete(SCARCES_VIEW_PARAM);
  } else if (tab === 'store' || tab === 'drops') {
    params.set(FEED_TAB_PARAM, 'scarces');
    if (tab === 'drops') params.set(SCARCES_VIEW_PARAM, 'works');
    else params.delete(SCARCES_VIEW_PARAM);
  } else {
    return;
  }

  const qs = params.toString();
  const hash = window.location.hash;
  const base = window.location.pathname;
  window.history.replaceState(
    null,
    '',
    qs ? `${base}?${qs}${hash}` : `${base}${hash}`
  );
}

/** Drop drawer URL params on close so a refresh lands on the plain face. */
export function clearPortfolioRailTabParam(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has(FEED_TAB_PARAM) && !params.has(SCARCES_VIEW_PARAM)) return;
  params.delete(FEED_TAB_PARAM);
  params.delete(SCARCES_VIEW_PARAM);
  const qs = params.toString();
  const base = window.location.pathname;
  const hash = window.location.hash;
  window.history.replaceState(
    null,
    '',
    qs ? `${base}?${qs}${hash}` : `${base}${hash}`
  );
}

const FEED_TAB_ITEMS: ReadonlyArray<{
  id: ProfileFeedTab;
  label: string;
  Icon: typeof NoteTextIcon;
}> = [
  { id: 'posts', label: 'Posts', Icon: NoteTextIcon },
  { id: 'replies', label: 'Replies', Icon: MessageRoundIcon },
  { id: 'reposts', label: 'Reposts', Icon: RepeatIcon },
  { id: 'media', label: 'Media', Icon: ImageIcon },
];

export interface PortfolioRailItem {
  id: PortfolioRailTab;
  label: string;
  Icon: typeof NoteTextIcon;
}

const PORTFOLIO_RAIL_ITEMS: readonly PortfolioRailItem[] = [
  ...FEED_TAB_ITEMS,
  { id: 'scarces', label: 'Scarces', Icon: StarsCIcon },
  { id: 'collection', label: 'Collection', Icon: GiftIcon },
];

/** Commerce tabs only render when the account has content behind them. */
export interface PortfolioRailAvailability {
  scarces: boolean;
  collection: boolean;
}

export function resolvePortfolioRailItems(
  availability: PortfolioRailAvailability
): PortfolioRailItem[] {
  return PORTFOLIO_RAIL_ITEMS.filter((item) =>
    isProfileFeedTab(item.id) ? true : availability[item.id]
  );
}

/** Sticky portfolio rail — feed sections + adaptive collection tabs. */
export function PortfolioRailTabs({
  tab,
  onTabChange,
  availability,
  className,
}: {
  tab: PortfolioRailTab;
  onTabChange: (tab: PortfolioRailTab) => void;
  availability: PortfolioRailAvailability;
  className?: string;
}) {
  return (
    <OsChipRail
      ariaLabel="Profile sections"
      className={['discover-tab-bar--header profile-feed-tab-bar', className]
        .filter(Boolean)
        .join(' ')}
      value={tab}
      onValueChange={onTabChange}
      tabIdFor={(option) => `profile-feed-tab-${option}`}
      items={resolvePortfolioRailItems(availability).map(
        ({ id, label, Icon }) => ({
          id,
          label: (
            <>
              <Icon className="profile-feed-tab-icon" aria-hidden />
              <span className="profile-feed-tab-label">
                <span>{label}</span>
              </span>
            </>
          ),
        })
      )}
    />
  );
}
