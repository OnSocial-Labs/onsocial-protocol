'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Divider,
  GlassSheet,
  ProtocolMotionArrow,
  SheetCloseButton,
} from '@onsocial/ui';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { usePageContentDrawer } from '@/contexts/page-content-drawer-context';
import { PageContentSections } from '@/components/portfolio/page-content-sections';
import { PageDrawerGestures } from '@/components/portfolio/page-drawer-gestures';
import { PageJoinedFactsSheet } from '@/components/portfolio/page-joined-facts-sheet';
import { pageContentDrawerPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import {
  formatPageDrawerCredentialsLine,
  formatPageDrawerJoinedLabel,
  pageDrawerActivityParts,
  type PageDrawerMeta,
} from '@/lib/page-drawer-meta';
import type { PublicPageConfig, PublicPageStats } from '@/lib/page-data';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';
import type {
  ProfilePostPeek,
  ProfileScarcePeek,
} from '@/lib/fetch-profile-peeks';

/** Tall page sheet — leave a strip of mood face visible above. */
const PAGE_DRAWER_PEEK_RATIO = 0.9;

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
  postPeeks?: ProfilePostPeek[];
  scarcePeeks?: ProfileScarcePeek[];
}

function MetaSep() {
  return (
    <span className="page-drawer-meta-sep" aria-hidden>
      ·
    </span>
  );
}

/** Personal whisper — name + compact facts; face owns avatar / @id / bio. */
function PageDrawerHeader({
  meta,
  titleId,
  onClose,
  onOpenJoined,
}: {
  meta: PageDrawerMeta;
  titleId: string;
  onClose: () => void;
  onOpenJoined: () => void;
}) {
  const activityParts = pageDrawerActivityParts(meta);
  const joinedLabel = formatPageDrawerJoinedLabel(meta.joinedAt);
  const credentialsLine = formatPageDrawerCredentialsLine(meta);
  const tagsLine = meta.tags.length > 0 ? meta.tags.join(' · ') : null;
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

          {credentialsLine ? (
            <p className="page-drawer-credentials">{credentialsLine}</p>
          ) : null}

          {tagsLine ? <p className="page-drawer-tags">{tagsLine}</p> : null}
        </div>
        <SheetCloseButton onClick={onClose} ariaLabel="Close page" />
      </div>
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
  postPeeks = [],
  scarcePeeks = [],
}: PageContentDrawerProps) {
  const { isOpen, close } = usePageContentDrawer();
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const [closing, setClosing] = useState(false);
  const [joinedFactsOpen, setJoinedFactsOpen] = useState(false);
  /** Briefly pin the gesture pill after jump chips (programmatic scroll). */
  const [dockPinned, setDockPinned] = useState(false);
  const dockPinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetOpen = isOpen && !closing;
  const dockHidden = useDockAutoHide(
    !sheetOpen || !scrollNode || dockPinned,
    scrollNode
  );

  const requestClose = useCallback(() => {
    setJoinedFactsOpen(false);
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    setDockPinned(false);
    close();
  }, [close]);

  useEffect(() => {
    return () => {
      if (dockPinTimerRef.current) {
        clearTimeout(dockPinTimerRef.current);
      }
    };
  }, []);

  const handleSectionJump = useCallback(() => {
    if (dockPinTimerRef.current) {
      clearTimeout(dockPinTimerRef.current);
    }
    setDockPinned(true);
    dockPinTimerRef.current = setTimeout(() => {
      setDockPinned(false);
      dockPinTimerRef.current = null;
    }, 500);
  }, []);

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
          stats={{
            ...stats,
            postCount: Math.max(
              stats.postCount,
              drawerMeta.postCount,
              postPeeks.length
            ),
            groupCount: Math.max(stats.groupCount, drawerMeta.guildCount),
          }}
          guilds={guilds}
          postPeeks={postPeeks}
          scarcePeeks={scarcePeeks}
          scarceCount={Math.max(
            drawerMeta.scarceMintCount,
            scarcePeeks.length
          )}
          scrollRoot={scrollNode}
          onSectionJump={handleSectionJump}
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
