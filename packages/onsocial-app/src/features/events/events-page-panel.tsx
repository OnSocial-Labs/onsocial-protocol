'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarFillIcon,
  ChevronDownIcon,
  OsSheetAction,
  OsSheetActions,
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  osFloatingPanelTriggerMetaClassName,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { ActionDrawer } from '@/components/ui/action-drawer';
import { ListLoadError } from '@/components/panels/list-load-error';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  fetchDropsPage,
  type DropDiscoveryItem,
} from '@/features/drops/drops-data';
import {
  EVENT_WINDOW_ORDER,
  eventMatchesHost,
  eventMatchesPlace,
  eventMatchesQuery,
  eventMatchesStyle,
  eventPlaceChoices,
  eventRowPlace,
  eventRowPrice,
  eventRowWhen,
  eventStyleLabel,
  eventWindowLabel,
  groupEvents,
} from '@/features/events/events-catalog';
import { TICKET_EVENT_SUGGESTIONS } from '@/features/scarces/drop-facets';
import {
  APP_EVENTS_NEW_PATH,
  APP_HOME_PATH,
  collectionPath,
} from '@/lib/app-routes';
import { DROPS_INDEX_PAGE_CLASS } from '@/lib/os-chrome-page';

const PAGE_SIZE = 48;

function EventRow({
  item,
  nowMs,
}: {
  item: DropDiscoveryItem;
  nowMs: number;
}) {
  const href = collectionPath(item.collectionId);
  const meta = [eventRowWhen(item, nowMs), eventRowPlace(item), eventRowPrice(item)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="market-listing-row drops-discovery-row" role="listitem">
      <Link
        href={href}
        scroll={false}
        className={`market-listing-thumb drops-discovery-thumb${
          item.mediaUrl ? ' has-media' : ''
        }`}
        aria-label={`Open ${item.title}`}
      >
        {item.mediaUrl ? (
          <img src={item.mediaUrl} alt="" />
        ) : (
          <span className="market-listing-thumb-fallback" />
        )}
      </Link>
      <div className="market-listing-copy drops-discovery-copy">
        <Link href={href} scroll={false} className="market-listing-title">
          {item.title}
        </Link>
        <Link href={href} scroll={false} className="drops-discovery-deal">
          <span className="drops-discovery-deal-bits">{meta}</span>
        </Link>
      </div>
    </div>
  );
}

export function EventsPagePanel({ initialNowMs }: { initialNowMs: number }) {
  const { accountId, isConnected, connect } = useAppWallet();
  const [items, setItems] = useState<DropDiscoveryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [nowMs, setNowMs] = useState(initialNowMs);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [styleId, setStyleId] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async (offset: number, replace: boolean) => {
    setFailed(false);
    if (replace) setLoading(true);
    try {
      const page = await fetchDropsPage({
        sort: 'new',
        mediumKind: 'ticket',
        limit: PAGE_SIZE,
        offset,
      });
      setItems((prev) => (replace ? page.items : [...prev, ...page.items]));
      setHasMore(page.hasMore);
      setNowMs(Date.now());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0, true);
  }, [load, reloadKey]);

  const places = useMemo(() => eventPlaceChoices(items), [items]);
  const filtered = items.filter(
    (item) =>
      eventMatchesQuery(item, query) &&
      eventMatchesStyle(item, styleId) &&
      eventMatchesPlace(item, placeId) &&
      eventMatchesHost(item, scope === 'mine' ? accountId : null)
  );
  const grouped = groupEvents(filtered, nowMs);
  const filterLabel = [
    styleId ? eventStyleLabel(styleId) : null,
    placeId ? places.find((place) => place.id === placeId)?.label : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const empty = !loading && !failed && filtered.length === 0;
  const needsConnect = scope === 'mine' && !isConnected;

  return (
    <OsAppScreen
      title="Events"
      compactChrome
      glassChrome
      scrollTuck="search"
      dockBack
      leading={null}
      backFallbackHref={APP_HOME_PATH}
      heading={
        <OsAppChromeNavSearch
          value={query}
          onValueChange={setQuery}
          placeholder="Search events"
          clearAriaLabel="Clear search"
          ariaLabel="Search events"
          idleClassName="discover-nav-search-field"
          leadingIcon={
            <CalendarFillIcon className="search-field-icon" aria-hidden />
          }
        />
      }
      actions={
        <Link href={APP_EVENTS_NEW_PATH} scroll={false} className="os-surface-chip">
          New event
        </Link>
      }
      toolbar={
        <div className="market-listing-toolbar">
          <OsChipRail
            ariaLabel="Event list"
            value={scope}
            onValueChange={(next) => {
              if (next === 'mine' && !isConnected) {
                void connect();
                return;
              }
              setScope(next);
            }}
            items={[
              { id: 'all', label: 'All' },
              { id: 'mine', label: 'My events' },
            ]}
          />
          <button
            type="button"
            className={`${osFloatingPanelTriggerClassName}${
              sheetOpen ? ' is-open' : ''
            }`}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            aria-label={filterLabel ? `Filter, ${filterLabel}` : 'Filter'}
            onClick={() => setSheetOpen(true)}
          >
            <span className={osFloatingPanelTriggerLabelClassName}>
              {filterLabel || 'Filter'}
            </span>
            <span className={osFloatingPanelTriggerMetaClassName}>
              <ChevronDownIcon
                className={`${osFloatingPanelTriggerChevronClassName}${
                  sheetOpen ? ' is-open' : ''
                }`}
                aria-hidden
              />
            </span>
          </button>
        </div>
      }
    >
      <div className="drops-screen-body">
        <div aria-hidden className="os-chrome-glass" />
        <div className={DROPS_INDEX_PAGE_CLASS}>
          {failed ? (
            <ListLoadError
              message="Couldn’t load events."
              retryLabel="Retry"
              onRetry={() => setReloadKey((value) => value + 1)}
            />
          ) : loading && items.length === 0 ? (
            <MarketListSkeleton rows={6} variant="drops" />
          ) : needsConnect ? (
            <p className="market-section-title">Connect to see your events.</p>
          ) : empty ? (
            <p className="market-section-title">
              No events yet.{' '}
              <Link href={APP_EVENTS_NEW_PATH} scroll={false}>
                New event
              </Link>
            </p>
          ) : (
            EVENT_WINDOW_ORDER.map((window) => {
              const rows = grouped[window];
              if (rows.length === 0) return null;
              return (
                <section
                  key={window}
                  className="market-section"
                  aria-labelledby={`events-${window}`}
                >
                  <h2 id={`events-${window}`} className="market-section-title">
                    {eventWindowLabel(window)}
                  </h2>
                  <div role="list">
                    {rows.map((item) => (
                      <EventRow key={item.collectionId} item={item} nowMs={nowMs} />
                    ))}
                  </div>
                </section>
              );
            })
          )}
          {hasMore ? (
            <button
              type="button"
              className="os-surface-chip"
              disabled={loading}
              onClick={() => void load(items.length, false)}
            >
              More
            </button>
          ) : null}
        </div>
      </div>
      <ActionDrawer
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onClosed={() => setSheetOpen(false)}
        label="Filter"
        closeAriaLabel="Close filter"
        titleAccessory={
          styleId || placeId ? (
            <button
              type="button"
              className="market-filter-title-clear"
              onClick={() => {
                setStyleId(null);
                setPlaceId(null);
              }}
            >
              Clear
            </button>
          ) : null
        }
        panelClassName="market-filter-sheet-panel"
        bodyClassName="market-filter-sheet-body"
        footer={
          <div className="market-filter-sheet-footer">
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready
                onClick={() => setSheetOpen(false)}
              >
                Show events
              </OsSheetAction>
            </OsSheetActions>
          </div>
        }
      >
        <p className="market-section-title">Style</p>
        <OsChipRail
          ariaLabel="Event style"
          value={styleId ?? 'all'}
          onValueChange={(next) => setStyleId(next === 'all' ? null : next)}
          items={[
            { id: 'all', label: 'All' },
            ...TICKET_EVENT_SUGGESTIONS.map((entry) => ({
              id: entry.id,
              label: entry.label,
            })),
          ]}
        />
        {places.length > 0 ? (
          <>
            <p className="market-section-title">Place</p>
            <OsChipRail
              ariaLabel="Event place"
              value={placeId ?? 'all'}
              onValueChange={(next) => setPlaceId(next === 'all' ? null : next)}
              items={[
                { id: 'all', label: 'All' },
                ...places.map((place) => ({ id: place.id, label: place.label })),
              ]}
            />
          </>
        ) : null}
      </ActionDrawer>
    </OsAppScreen>
  );
}
