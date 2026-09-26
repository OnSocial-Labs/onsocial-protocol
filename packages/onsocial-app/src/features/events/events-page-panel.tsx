'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  eventMatchesScan,
  eventPlaceChoices,
  eventScanActive,
  scanTicketEvents,
  type EventScan,
  eventRowPlace,
  eventRowPrice,
  eventRowWhen,
  eventStyleLabel,
  eventWindowLabel,
  groupEvents,
  type EventWindow,
} from '@/features/events/events-catalog';
import {
  eventGuestCountAria,
  eventGuestCountLabel,
  eventGuestKind,
  eventGuestSheetCopy,
  loadEventCheckInIds,
  loadEventHolderIds,
  loadHeldCollectionIds,
  resolveEventGuestCount,
  showEventGuestCount,
  type EventGuestKind,
} from '@/features/events/event-guests';
import {
  useEventCheckInRosters,
  useEventHolderRosters,
} from '@/features/events/use-event-guest-counts';
import { ScarceFansSheet } from '@/features/scarces/scarce-fans-sheet';
import {
  dropFacetFieldLabel,
  TICKET_EVENT_SUGGESTIONS,
} from '@/features/scarces/drop-facets';
import {
  APP_EVENTS_NEW_PATH,
  APP_HOME_PATH,
  collectionPath,
} from '@/lib/app-routes';
import { DROPS_INDEX_PAGE_CLASS } from '@/lib/os-chrome-page';
import { SHEET_Z } from '@/lib/sheet-z';

const PAGE_SIZE = 48;

function eventGuestRoster(
  kind: EventGuestKind,
  collectionId: string,
  rosters: {
    holders: Record<string, string[]>;
    inNow: Record<string, string[]>;
    attended: Record<string, string[]>;
  }
): string[] | undefined {
  const source =
    kind === 'going'
      ? rosters.holders
      : kind === 'in'
        ? rosters.inNow
        : rosters.attended;
  return source[collectionId];
}

function EventRow({
  item,
  nowMs,
  window,
  guestCount,
  onGuests,
}: {
  item: DropDiscoveryItem;
  nowMs: number;
  window: EventWindow;
  guestCount: number | null;
  onGuests: (item: DropDiscoveryItem, kind: EventGuestKind) => void;
}) {
  const href = collectionPath(item.collectionId);
  const meta = [
    eventRowWhen(item, nowMs),
    eventRowPlace(item),
    eventRowPrice(item),
  ]
    .filter(Boolean)
    .join(' · ');
  const kind = eventGuestKind(window);
  const guestLabel = showEventGuestCount(kind, guestCount)
    ? eventGuestCountLabel(kind, guestCount)
    : null;

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
        {meta || guestLabel ? (
          <div className="drops-discovery-deal">
            {meta ? (
              <Link
                href={href}
                scroll={false}
                className="drops-discovery-deal-bits"
              >
                {meta}
              </Link>
            ) : null}
            {guestLabel ? (
              <>
                {meta ? (
                  <span className="drops-discovery-deal-sep" aria-hidden>
                    {' · '}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="events-guest-count"
                  aria-label={eventGuestCountAria(kind, guestLabel)}
                  onClick={() => onGuests(item, kind)}
                >
                  {guestLabel}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EventsPagePanel({ initialNowMs }: { initialNowMs: number }) {
  const { accountId, isConnected } = useAppWallet();
  const [items, setItems] = useState<DropDiscoveryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [nowMs, setNowMs] = useState(initialNowMs);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [styleId, setStyleId] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [seen, setSeen] = useState<DropDiscoveryItem[]>([]);
  const [heldIds, setHeldIds] = useState<Set<string> | null>(null);
  const [heldFor, setHeldFor] = useState<string | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestSheet, setGuestSheet] = useState<{
    collectionId: string;
    title: string;
    kind: EventGuestKind;
    ids: string[];
    loading: boolean;
    error: boolean;
  } | null>(null);
  const reloadGenRef = useRef(0);

  const mineAccount = scope === 'mine' && accountId ? accountId : null;
  if (heldFor !== mineAccount) {
    setHeldFor(mineAccount);
    setHeldIds(null);
  }
  const holdingsReady = scope !== 'mine' || !accountId || heldIds !== null;
  const scan = useMemo<EventScan>(
    () => ({
      query: debouncedQuery,
      styleId,
      placeId,
      hostId: scope === 'mine' && accountId ? accountId : null,
      heldCollectionIds: scope === 'mine' ? heldIds : null,
    }),
    [accountId, debouncedQuery, heldIds, placeId, scope, styleId]
  );
  const narrowed = eventScanActive(scan);
  const listFiltered = Boolean(debouncedQuery || styleId || placeId);

  const fetchTicketPage = useCallback(
    (offset: number) =>
      fetchDropsPage({
        sort: 'new',
        mediumKind: 'ticket',
        limit: PAGE_SIZE,
        offset,
      }),
    []
  );

  const load = useCallback(
    async (offset: number, replace: boolean) => {
      const gen = replace ? ++reloadGenRef.current : reloadGenRef.current;
      if (!holdingsReady) {
        if (replace && gen === reloadGenRef.current) {
          setItems([]);
          setSeen([]);
          setNextOffset(0);
          setHasMore(false);
          setFailed(false);
          setLoading(true);
        }
        return;
      }
      setFailed(false);
      if (replace) {
        setItems([]);
        setHasMore(false);
        setLoading(true);
      }
      if (scope === 'mine' && !accountId) {
        if (gen !== reloadGenRef.current) return;
        setItems([]);
        setSeen([]);
        setNextOffset(0);
        setHasMore(false);
        setLoading(false);
        return;
      }
      try {
        if (!narrowed) {
          const page = await fetchTicketPage(offset);
          if (gen !== reloadGenRef.current) return;
          setItems((prev) => (replace ? page.items : [...prev, ...page.items]));
          setSeen((prev) => (replace ? page.items : [...prev, ...page.items]));
          setNextOffset(offset + page.items.length);
          setHasMore(page.hasMore);
        } else {
          const result = await scanTicketEvents({
            fetchPage: fetchTicketPage,
            startOffset: offset,
            need: PAGE_SIZE,
            match: (item) => eventMatchesScan(item, scan),
          });
          if (gen !== reloadGenRef.current) return;
          setItems((prev) =>
            replace ? result.matches : [...prev, ...result.matches]
          );
          setSeen((prev) =>
            replace ? result.seen : [...prev, ...result.seen]
          );
          setNextOffset(result.nextOffset);
          setHasMore(result.hasMore);
        }
        setNowMs(Date.now());
      } catch {
        if (gen !== reloadGenRef.current) return;
        setFailed(true);
      } finally {
        if (gen === reloadGenRef.current) setLoading(false);
      }
    },
    [accountId, fetchTicketPage, holdingsReady, narrowed, scan, scope]
  );

  useEffect(() => {
    if (scope !== 'mine' || !accountId) return;
    let cancelled = false;
    void loadHeldCollectionIds(accountId)
      .then((ids) => {
        if (!cancelled) setHeldIds(ids);
      })
      .catch(() => {
        if (!cancelled) setHeldIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, scope]);

  useEffect(() => {
    const handle = window.setTimeout(
      () => setDebouncedQuery(query.trim()),
      200
    );
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    void load(0, true);
  }, [load, reloadKey]);

  const places = useMemo(() => eventPlaceChoices(seen), [seen]);
  const grouped = groupEvents(items, nowMs);
  const goingIds = grouped.upcoming
    .filter((item) => item.mintedCount > 0)
    .map((item) => item.collectionId);
  const nowIds = grouped.now.map((item) => item.collectionId);
  const pastIds = grouped.past.map((item) => item.collectionId);
  const holderRosters = useEventHolderRosters(goingIds);
  const inRosters = useEventCheckInRosters(nowIds, 20_000);
  const attendedRosters = useEventCheckInRosters(pastIds);
  const guestRosters = useMemo(
    () => ({
      holders: holderRosters,
      inNow: inRosters,
      attended: attendedRosters,
    }),
    [attendedRosters, holderRosters, inRosters]
  );

  const openGuests = useCallback(
    (item: DropDiscoveryItem, kind: EventGuestKind) => {
      const cached = eventGuestRoster(kind, item.collectionId, guestRosters);
      setGuestOpen(true);
      setGuestSheet({
        collectionId: item.collectionId,
        title: item.title,
        kind,
        ids: cached ?? [],
        loading: cached === undefined,
        error: false,
      });
      const loadGuests =
        kind === 'going' ? loadEventHolderIds : loadEventCheckInIds;
      void loadGuests(item.collectionId)
        .then((ids) => {
          setGuestSheet((current) =>
            current?.collectionId === item.collectionId && current.kind === kind
              ? { ...current, ids, loading: false, error: false }
              : current
          );
        })
        .catch(() => {
          setGuestSheet((current) => {
            if (
              current?.collectionId !== item.collectionId ||
              current.kind !== kind
            ) {
              return current;
            }
            if (cached !== undefined) {
              return { ...current, loading: false, error: false };
            }
            return { ...current, ids: [], loading: false, error: true };
          });
        });
    },
    [guestRosters]
  );
  const filterLabel = [
    styleId ? eventStyleLabel(styleId) : null,
    placeId ? places.find((place) => place.id === placeId)?.label : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const empty = !loading && !failed && items.length === 0;
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
        <Link
          href={APP_EVENTS_NEW_PATH}
          scroll={false}
          className="os-surface-chip"
        >
          New event
        </Link>
      }
      toolbar={
        <div className="market-listing-toolbar">
          <OsChipRail
            ariaLabel="Event list"
            value={scope}
            onValueChange={setScope}
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
          ) : empty && listFiltered ? (
            <p className="market-section-title">No events match.</p>
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
                    {rows.map((item) => {
                      const kind = eventGuestKind(window);
                      return (
                        <EventRow
                          key={item.collectionId}
                          item={item}
                          nowMs={nowMs}
                          window={window}
                          guestCount={resolveEventGuestCount(kind, {
                            mintedCount: item.mintedCount,
                            roster: eventGuestRoster(
                              kind,
                              item.collectionId,
                              guestRosters
                            ),
                          })}
                          onGuests={openGuests}
                        />
                      );
                    })}
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
              onClick={() => void load(nextOffset, false)}
            >
              More
            </button>
          ) : null}
        </div>
      </div>
      <ScarceFansSheet
        open={guestOpen}
        onClose={() => setGuestOpen(false)}
        fanIds={guestSheet?.ids ?? []}
        fanCount={guestSheet?.ids.length ?? 0}
        dropTitle={guestSheet?.title}
        idsLoading={guestSheet?.loading ?? false}
        idsError={guestSheet?.error ?? false}
        zIndex={SHEET_Z.list}
        {...eventGuestSheetCopy(guestSheet?.kind ?? 'going')}
      />
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
        <p className="market-section-title">{dropFacetFieldLabel('ticket')}</p>
        <OsChipRail
          ariaLabel={dropFacetFieldLabel('ticket')}
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
                ...places.map((place) => ({
                  id: place.id,
                  label: place.label,
                })),
              ]}
            />
          </>
        ) : null}
      </ActionDrawer>
    </OsAppScreen>
  );
}
