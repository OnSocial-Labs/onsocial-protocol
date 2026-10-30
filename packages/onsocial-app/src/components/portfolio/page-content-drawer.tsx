'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {  GlassSheet,
  ProtocolMotionArrow,
  SheetCloseButton,
  useScrollLock,
} from '@onsocial/ui';
import { usePageContentDrawer } from '@/contexts/page-content-drawer-context';
import { usePortfolioPostPeeks } from '@/contexts/portfolio-post-peeks-context';
import { usePortfolioShelf } from '@/contexts/portfolio-shelf-context';
import { PageDrawerRailPanels } from '@/components/portfolio/page-drawer-rail';
import {
  PortfolioRailTabs,
  clearPortfolioRailTabParam,
  normalizeLegacyPortfolioRailUrl,
  resolvePortfolioRailTab,
  usePortfolioRailTabParam,
  type PortfolioRailAvailability,
} from '@/components/portfolio/profile-feed-tabs';
import { PageJoinedFactsSheet } from '@/components/portfolio/page-joined-facts-sheet';
import { pageContentDrawerPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import {
  formatPageDrawerJoinedLabel,
  type PageDrawerMeta,
} from '@/lib/page-drawer-meta';
import type { PublicPageStats } from '@/lib/page-data';
import type { ProfileCreatedPeek } from '@/lib/fetch-profile-peeks';
import {
  EMPTY_PROFILE_STORE,
  type ProfileStoreShelf,
} from '@/lib/profile-store-types';
import { isScarcesTabVisible } from '@/lib/profile-store-available';
import { fetchOwnedScarcesPage } from '@/features/market/market-listings';
import { peekOwnedVaultPage } from '@/features/market/owned-vault-cache';
import {
  PAGE_DRAWER_HOLDINGS_PEEK,
  toPortfolioHoldingPeek,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';
import { SHEET_Z } from '@/lib/sheet-z';

/** Covers the face. A short drag snaps back; past the dismiss gap the handle closes it. */
const PAGE_DRAWER_PEEK_RATIO = 1;

function seedDrawerHoldings(
  accountId: string,
  shelfHoldings: PortfolioHoldingPeek[]
): PortfolioHoldingPeek[] {
  if (shelfHoldings.length > 0) return shelfHoldings;
  const cached = peekOwnedVaultPage(accountId);
  if (!cached || cached.items.length === 0) return [];
  return cached.items.map(toPortfolioHoldingPeek);
}

interface PageContentDrawerProps {
  pageAccountId: string;
  mood: ResolvedMood;
  profileName?: string | null;
  avatarUrl?: string | null;
  drawerMeta: PageDrawerMeta;
  stats: PublicPageStats;
  createdPeeks?: ProfileCreatedPeek[];
  storeShelf?: ProfileStoreShelf;
}

/** Compact chrome — name + Joined. Counts live in the tabs and the facts sheet. */
function PageDrawerHeader({
  meta,
  titleId,
  onClose,
  onOpenJoined,
  rail,
}: {
  meta: PageDrawerMeta;
  titleId: string;
  onClose: () => void;
  onOpenJoined: () => void;
  rail: ReactNode;
}) {
  const joinedLabel = formatPageDrawerJoinedLabel(meta.joinedAt);

  return (
    <div className="page-drawer-header">
      <div className="page-drawer-chrome-row">
        <div className="page-drawer-meta">
          <p className="page-drawer-name">{meta.name}</p>

          {joinedLabel ? (
            <p className="page-drawer-facts">
              <button
                type="button"
                className="page-drawer-joined group"
                onClick={onOpenJoined}
                aria-label={`Account facts · Joined ${joinedLabel}`}
              >
                <span>Joined {joinedLabel}</span>
                <ProtocolMotionArrow className="page-drawer-joined-arrow" />
              </button>
            </p>
          ) : null}
        </div>
        <SheetCloseButton onClick={onClose} ariaLabel="Close page" />
      </div>

      {rail}

      <h2 id={titleId} className="sr-only">
        {meta.name} page
      </h2>
    </div>
  );
}

function PageContentDrawerInner({
  pageAccountId,
  mood,
  profileName,
  avatarUrl = null,
  drawerMeta,
  stats,
  createdPeeks = [],
  storeShelf = EMPTY_PROFILE_STORE,
}: PageContentDrawerProps) {
  const { isOpen, close, scrollNode, setScrollNode } = usePageContentDrawer();
  const { postPeeks } = usePortfolioPostPeeks();
  const shelf = usePortfolioShelf();
  const createdPeeksResolved =
    shelf.createdPeeks.length > 0 ? shelf.createdPeeks : createdPeeks;
  const storeShelfResolved =
    shelf.storeShelf.listingCount + shelf.storeShelf.drops.length > 0 ||
    shelf.storeShelf.hasMore
      ? shelf.storeShelf
      : storeShelf;
  const [ownedHoldings, setOwnedHoldings] = useState<PortfolioHoldingPeek[]>(
    () => seedDrawerHoldings(pageAccountId, shelf.holdings)
  );
  const [holdingsSettled, setHoldingsSettled] = useState(
    () => seedDrawerHoldings(pageAccountId, shelf.holdings).length > 0
  );
  const [closing, setClosing] = useState(false);
  const [joinedFactsOpen, setJoinedFactsOpen] = useState(false);
  const sheetOpen = isOpen && !closing;

  const drawerStats = useMemo(
    () => ({
      ...stats,
      postCount: Math.max(
        stats.postCount,
        drawerMeta.postCount,
        postPeeks.length
      ),
      groupCount: Math.max(stats.groupCount, drawerMeta.guildCount),
    }),
    [drawerMeta.guildCount, drawerMeta.postCount, postPeeks.length, stats]
  );

  /*
   * Prefer streamed SSR peeks. Client fetch is fallback only — fetching on
   * drawer open used to insert the Collectibles chip after layout.
   */
  useEffect(() => {
    if (shelf.holdings.length > 0) return;
    let cancelled = false;
    void fetchOwnedScarcesPage(pageAccountId, {
      pageSize: PAGE_DRAWER_HOLDINGS_PEEK,
    })
      .then((page) => {
        if (cancelled) return;
        setOwnedHoldings(page.items.map(toPortfolioHoldingPeek));
        setHoldingsSettled(true);
      })
      .catch(() => {
        if (cancelled) return;
        setOwnedHoldings([]);
        setHoldingsSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pageAccountId, shelf.holdings]);

  const holdings =
    shelf.holdings.length > 0 ? shelf.holdings : ownedHoldings;
  const holdingsCount = holdings.length;
  const createdCount = Math.max(
    createdPeeksResolved.length,
    drawerMeta.scarceMintCount
  );

  const [tab, setTab] = usePortfolioRailTabParam();
  const availability: PortfolioRailAvailability = useMemo(
    () => ({
      scarces: isScarcesTabVisible(storeShelfResolved, createdCount),
      collection: holdingsCount > 0,
    }),
    [createdCount, holdingsCount, storeShelfResolved]
  );
  // Holdings arrive after Back. Keep Collectibles until that list is known.
  const collectionPending =
    tab === 'collection' &&
    shelf.holdings.length === 0 &&
    ownedHoldings.length === 0 &&
    !holdingsSettled;
  const activeTab = resolvePortfolioRailTab(
    tab,
    availability,
    collectionPending
  );

  useEffect(() => {
    if (!sheetOpen) return;
    normalizeLegacyPortfolioRailUrl();
  }, [sheetOpen]);

  const requestClose = useCallback(() => {
    setJoinedFactsOpen(false);
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    // URL mirrors drawer state — closed face carries no `?tab=`.
    clearPortfolioRailTabParam();
    close();
  }, [close]);

  // Switching tabs from deep content — snap the sheet body back to the top.
  const handleTabChange = useCallback(
    (next: typeof tab) => {
      setTab(next);
      scrollNode?.scrollTo({ top: 0 });
    },
    [scrollNode, setTab]
  );

  const panelStyle = pageContentDrawerPanelStyle(mood.cssVars) as CSSProperties;

  useScrollLock(isOpen || closing);

  return (
    <>
      <GlassSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        tone="mood-thread"
        moodId={mood.id}
        panelStyle={panelStyle}
        peekRatio={PAGE_DRAWER_PEEK_RATIO}
        initialDetent="full"
        zIndex={SHEET_Z.pageDrawer}
        keepDock
        ariaLabelledBy="page-drawer-title"
        backdropLabel="Close page"
        bodyClassName="page-drawer-body"
        bodyRef={setScrollNode}
        panelClassName="page-drawer-panel"
        header={
          <>
            <PageDrawerHeader
              meta={drawerMeta}
              titleId="page-drawer-title"
              onClose={requestClose}
              onOpenJoined={() => setJoinedFactsOpen(true)}
              rail={
                <PortfolioRailTabs
                  tab={activeTab}
                  onTabChange={handleTabChange}
                  availability={availability}
                  keep={collectionPending ? 'collection' : null}
                  className="page-drawer-rail-tabs"
                />
              }
            />          </>
        }
      >
        <PageDrawerRailPanels
          pageAccountId={pageAccountId}
          profileName={profileName}
          avatarUrl={avatarUrl}
          tab={activeTab}
          postCount={drawerStats.postCount}
          storeShelf={storeShelfResolved}
          createdPeeks={createdPeeksResolved}
          holdings={holdings}
        />
      </GlassSheet>

      <PageJoinedFactsSheet
        open={joinedFactsOpen && isOpen}
        onOpenChange={setJoinedFactsOpen}
        pageAccountId={pageAccountId}
        meta={drawerMeta}
        mood={mood}
      />
    </>
  );
}

/** Suspense wrapper — the rail tab param reads `useSearchParams`. */
export function PageContentDrawer(props: PageContentDrawerProps) {
  return (
    <Suspense fallback={null}>
      <PageContentDrawerInner {...props} />
    </Suspense>
  );
}
