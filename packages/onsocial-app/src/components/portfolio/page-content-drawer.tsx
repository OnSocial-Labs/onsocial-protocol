'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { PageSection } from '@onsocial/sdk';
import {
  Divider,
  GlassSheet,
  ProtocolMotionArrow,
  SheetCloseButton,
} from '@onsocial/ui';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { usePageContentDrawer } from '@/contexts/page-content-drawer-context';
import { usePortfolioPostPeeks } from '@/contexts/portfolio-post-peeks-context';
import { PageContentSections } from '@/components/portfolio/page-content-sections';
import { PageDrawerGestures } from '@/components/portfolio/page-drawer-gestures';
import { PageDrawerJumpRail } from '@/components/portfolio/page-drawer-jump-rail';
import { PageJoinedFactsSheet } from '@/components/portfolio/page-joined-facts-sheet';
import { pageContentDrawerPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import {
  formatPageDrawerJoinedLabel,
  pageDrawerActivityParts,
  type PageDrawerMeta,
} from '@/lib/page-drawer-meta';
import type { PublicPageConfig, PublicPageStats } from '@/lib/page-data';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';
import type { ProfileScarcePeek } from '@/lib/fetch-profile-peeks';
import {
  EMPTY_PROFILE_STORE,
  type ProfileStoreShelf,
} from '@/lib/profile-store-types';
import {
  pageDrawerJumpSections,
  pageDrawerSectionDomId,
  resolvePageDrawerActiveSection,
  resolveVisiblePageSections,
} from '@/lib/page-sections';
import { resolvePortfolioSocialLinks } from '@/lib/profile-social-links';

/** Tall page sheet — thin mood-face strip above (~95dvh). */
const PAGE_DRAWER_PEEK_RATIO = 0.95;

/** Marker inset from the scrollport top for scroll-spy. */
const JUMP_SPY_OFFSET_PX = 12;
/** Slack so a landed section still counts as active. */
const JUMP_SPY_ACTIVE_SLACK_PX = 8;
/** Only force-last when the scroller is at the end and the last chapter is in view. */
const JUMP_SPY_END_PX = 4;
/** Fallback if `scrollend` never fires. */
const JUMP_LOCK_MS = 700;

interface PageContentDrawerProps {
  pageAccountId: string;
  mood: ResolvedMood;
  profileName?: string | null;
  bio?: string | null;
  profileLinks?: unknown;
  avatarUrl?: string | null;
  drawerMeta: PageDrawerMeta;
  config: PublicPageConfig;
  stats: PublicPageStats;
  guilds?: ProfileGuildSummary[];
  scarcePeeks?: ProfileScarcePeek[];
  storeShelf?: ProfileStoreShelf;
}

function MetaSep() {
  return (
    <span className="page-drawer-meta-sep" aria-hidden>
      ·
    </span>
  );
}

function resolveActiveJumpSection(
  scroller: HTMLElement,
  sections: PageSection[]
): PageSection | null {
  const scrollerTop = scroller.getBoundingClientRect().top;
  const marker = scrollerTop + JUMP_SPY_OFFSET_PX;
  const tops = sections.map((section) => {
    const node = document.getElementById(pageDrawerSectionDomId(section));
    return node?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
  });
  const lastTop = tops[tops.length - 1] ?? Number.POSITIVE_INFINITY;
  const atScrollEnd =
    scroller.scrollTop + scroller.clientHeight >=
    scroller.scrollHeight - JUMP_SPY_END_PX;
  /*
   * Only force the last chip when we are actually at the end *and* the last
   * section has reached the marker — avoids highlighting “Links” while a
   * middle jump is clamped by short content.
   */
  const scrolledToEnd =
    atScrollEnd && lastTop <= marker + JUMP_SPY_ACTIVE_SLACK_PX;
  return resolvePageDrawerActiveSection(
    sections,
    tops,
    marker + JUMP_SPY_ACTIVE_SLACK_PX,
    scrolledToEnd
  );
}

/** Compact chrome — name + facts + chips; credentials/tags live in Joined. */
function PageDrawerHeader({
  meta,
  titleId,
  onClose,
  onOpenJoined,
  jumpSections,
  activeSection,
  onJump,
}: {
  meta: PageDrawerMeta;
  titleId: string;
  onClose: () => void;
  onOpenJoined: () => void;
  jumpSections: PageSection[];
  activeSection: PageSection | null;
  onJump: (section: PageSection) => void;
}) {
  const activityParts = pageDrawerActivityParts(meta);
  const joinedLabel = formatPageDrawerJoinedLabel(meta.joinedAt);
  const hasFactsRow = activityParts.length > 0 || Boolean(joinedLabel);

  return (
    <div className="page-drawer-header">
      <div className="page-drawer-chrome-row">
        <div className="page-drawer-meta">
          <p className="page-drawer-name">{meta.name}</p>

          {hasFactsRow ? (
            <p className="page-drawer-facts">
              {activityParts.map((part, index) => (
                <Fragment key={part.key}>
                  {index > 0 ? <MetaSep /> : null}
                  <span className="page-drawer-fact">
                    <span className="page-drawer-fact-count">{part.count}</span>
                    <span className="page-drawer-fact-unit"> {part.unit}</span>
                  </span>
                </Fragment>
              ))}
              {joinedLabel ? (
                <>
                  {activityParts.length > 0 ? <MetaSep /> : null}
                  <button
                    type="button"
                    className="page-drawer-joined group"
                    onClick={onOpenJoined}
                    aria-label={`Account facts · Joined ${joinedLabel}`}
                  >
                    <span>Joined {joinedLabel}</span>
                    <ProtocolMotionArrow className="page-drawer-joined-arrow" />
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <SheetCloseButton onClick={onClose} ariaLabel="Close page" />
      </div>

      <PageDrawerJumpRail
        sections={jumpSections}
        activeSection={activeSection}
        onJump={onJump}
      />

      <h2 id={titleId} className="sr-only">
        {meta.name} page
      </h2>
    </div>
  );
}

export function PageContentDrawer({
  pageAccountId,
  mood,
  profileName,
  bio = null,
  profileLinks = null,
  avatarUrl = null,
  drawerMeta,
  config,
  stats,
  guilds = [],
  scarcePeeks = [],
  storeShelf = EMPTY_PROFILE_STORE,
}: PageContentDrawerProps) {
  const { isOpen, close } = usePageContentDrawer();
  const { postPeeks } = usePortfolioPostPeeks();
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const [closing, setClosing] = useState(false);
  const [joinedFactsOpen, setJoinedFactsOpen] = useState(false);
  /** Hide gesture pill while a section jump scrolls. */
  const [dockHideRequest, setDockHideRequest] = useState(0);
  const sheetOpen = isOpen && !closing;
  /** Pin dock while the sheet mounts — avoid open-frame hide. */
  const [openPinned, setOpenPinned] = useState(false);
  const dockHidden = useDockAutoHide(
    !sheetOpen || !scrollNode || openPinned,
    scrollNode,
    dockHideRequest
  );

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

  const scarceCount = Math.max(
    drawerMeta.scarceMintCount,
    scarcePeeks.length
  );
  const storeListingCount = storeShelf.listingCount + storeShelf.drops.length;

  const links = useMemo(
    () => resolvePortfolioSocialLinks(profileLinks),
    [profileLinks]
  );

  const jumpSections = useMemo(
    () =>
      pageDrawerJumpSections(
        resolveVisiblePageSections(config, {
          stats: drawerStats,
          guilds,
          links,
          scarceCount,
          storeListingCount,
          postPeekCount: postPeeks.length,
        })
      ),
    [
      config,
      drawerStats,
      guilds,
      links,
      postPeeks.length,
      scarceCount,
      storeListingCount,
    ]
  );

  const [activeSection, setActiveSection] = useState<PageSection | null>(
    () => jumpSections[0] ?? null
  );
  /** While set, scroll-spy must not steal the pressed chip mid-jump. */
  const jumpLockRef = useRef<PageSection | null>(null);
  const jumpLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** After a jump, ignore spy until the user actually scrolls away. */
  const spyHoldScrollTopRef = useRef<number | null>(null);
  const jumpScrollEndRef = useRef<((event: Event) => void) | null>(null);

  const clearJumpLock = useCallback(() => {
    jumpLockRef.current = null;
    spyHoldScrollTopRef.current = null;
    if (jumpLockTimerRef.current) {
      clearTimeout(jumpLockTimerRef.current);
      jumpLockTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!sheetOpen) {
      queueMicrotask(() => {
        setOpenPinned(false);
      });
      clearJumpLock();
      return;
    }
    queueMicrotask(() => {
      setOpenPinned(true);
    });
    const timer = setTimeout(() => setOpenPinned(false), 450);
    return () => clearTimeout(timer);
  }, [clearJumpLock, sheetOpen]);

  if (jumpSections.length === 0) {
    if (activeSection !== null) {
      setActiveSection(null);
    }
  } else if (!activeSection || !jumpSections.includes(activeSection)) {
    setActiveSection(jumpSections[0]!);
  }

  useEffect(() => {
    if (!scrollNode || jumpSections.length < 2) {
      return;
    }

    const syncActive = () => {
      if (jumpLockRef.current) {
        setActiveSection(jumpLockRef.current);
        return;
      }

      const holdTop = spyHoldScrollTopRef.current;
      if (holdTop != null) {
        if (Math.abs(scrollNode.scrollTop - holdTop) < 16) {
          return;
        }
        spyHoldScrollTopRef.current = null;
      }

      const next = resolveActiveJumpSection(scrollNode, jumpSections);
      if (next) {
        setActiveSection(next);
      }
    };

    scrollNode.addEventListener('scroll', syncActive, { passive: true });
    return () => {
      scrollNode.removeEventListener('scroll', syncActive);
    };
  }, [jumpSections, scrollNode]);

  useEffect(() => {
    return () => {
      clearJumpLock();
    };
  }, [clearJumpLock]);

  const requestClose = useCallback(() => {
    setJoinedFactsOpen(false);
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    clearJumpLock();
    close();
  }, [clearJumpLock, close]);

  const handleJump = useCallback(
    (section: PageSection) => {
      const node = document.getElementById(pageDrawerSectionDomId(section));
      if (!node) return;

      const scroller = scrollNode;
      if (scroller && jumpScrollEndRef.current) {
        scroller.removeEventListener('scrollend', jumpScrollEndRef.current);
        jumpScrollEndRef.current = null;
      }
      if (jumpLockTimerRef.current) {
        clearTimeout(jumpLockTimerRef.current);
        jumpLockTimerRef.current = null;
      }

      jumpLockRef.current = section;
      spyHoldScrollTopRef.current = null;
      setActiveSection(section);
      setDockHideRequest((n) => n + 1);

      const finishJump = (settledTop: number | null) => {
        if (jumpLockRef.current !== section) return;
        jumpLockRef.current = null;
        if (jumpLockTimerRef.current) {
          clearTimeout(jumpLockTimerRef.current);
          jumpLockTimerRef.current = null;
        }
        if (scroller && jumpScrollEndRef.current) {
          scroller.removeEventListener('scrollend', jumpScrollEndRef.current);
          jumpScrollEndRef.current = null;
        }
        /*
         * Keep the pressed chip. Spy was snapping back to the first section
         * on early scrollend / settle — hold until the user scrolls again.
         */
        spyHoldScrollTopRef.current = settledTop;
        setActiveSection(section);
      };

      if (!scroller) {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        jumpLockTimerRef.current = setTimeout(() => finishJump(null), JUMP_LOCK_MS);
        return;
      }

      const scrollerRect = scroller.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const targetTop = Math.min(
        Math.max(0, scroller.scrollTop + (nodeRect.top - scrollerRect.top)),
        Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      );

      scroller.scrollTo({ top: targetTop, behavior: 'smooth' });

      const onScrollEnd = () => {
        jumpScrollEndRef.current = null;
        // Ignore spurious early scrollend before we are near the target.
        if (Math.abs(scroller.scrollTop - targetTop) > 24) {
          return;
        }
        finishJump(scroller.scrollTop);
      };
      jumpScrollEndRef.current = onScrollEnd;
      scroller.addEventListener('scrollend', onScrollEnd);

      jumpLockTimerRef.current = setTimeout(() => {
        finishJump(scroller.scrollTop);
      }, JUMP_LOCK_MS);
    },
    [scrollNode]
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
        zIndex={48}
        ariaLabelledBy="page-drawer-title"
        backdropLabel="Close page"
        bodyClassName="page-drawer-body"
        bodyRef={setScrollNode}
        panelClassName="page-drawer-panel"
        footerOverlay
        header={
          <>
            <PageDrawerHeader
              meta={drawerMeta}
              titleId="page-drawer-title"
              onClose={requestClose}
              onOpenJoined={() => setJoinedFactsOpen(true)}
              jumpSections={jumpSections}
              activeSection={activeSection}
              onJump={handleJump}
            />
            <Divider variant="section" className="glass-sheet-header-divider" />
          </>
        }
        footer={
          <PageDrawerGestures
            pageAccountId={pageAccountId}
            profileName={profileName}
            bio={bio}
            avatarUrl={avatarUrl}
            mood={mood}
            dockHidden={dockHidden}
          />
        }
      >
        <PageContentSections
          pageAccountId={pageAccountId}
          profileLinks={profileLinks}
          config={config}
          stats={drawerStats}
          guilds={guilds}
          postPeeks={postPeeks}
          scarcePeeks={scarcePeeks}
          scarceCount={scarceCount}
          storeShelf={storeShelf}
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
