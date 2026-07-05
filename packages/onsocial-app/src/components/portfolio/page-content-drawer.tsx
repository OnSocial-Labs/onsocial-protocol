'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { usePageContentDrawer } from '@/contexts/page-content-drawer-context';
import { PageContentSections } from '@/components/portfolio/page-content-sections';
import { StandingSheetSubjectAvatar } from '@/components/panels/standing-sheet-subject';
import { Divider, GlassSheet, SheetCloseButton } from '@onsocial/ui';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { pageContentDrawerPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { resolvePageSections } from '@/lib/page-sections';
import type { PublicPageConfig, PublicPageStats } from '@/lib/page-data';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';

interface PageContentDrawerProps {
  pageAccountId: string;
  mood: ResolvedMood;
  profileName?: string | null;
  avatarUrl?: string | null;
  config: PublicPageConfig;
  stats: PublicPageStats;
  guilds?: ProfileGuildSummary[];
}

function PageDrawerHeader({
  pageAccountId,
  profileName,
  avatarUrl,
  titleId,
  onClose,
}: {
  pageAccountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  titleId: string;
  onClose: () => void;
}) {
  const name = displayName(pageAccountId, profileName ?? undefined);
  const handle = fallbackLabel(pageAccountId);

  return (
    <div className="standing-sheet-header page-drawer-header">
      <div className="standing-sheet-subject-row page-drawer-subject-row">
        <div className="standing-sheet-subject">
          <StandingSheetSubjectAvatar avatarUrl={avatarUrl ?? null} />
          <span className="standing-sheet-subject-copy">
            <span className="standing-sheet-subject-name">{name}</span>
            <span className="profile-handle">@{handle}</span>
          </span>
        </div>
        <div className="standing-sheet-actions">
          <SheetCloseButton onClick={onClose} ariaLabel="Close page" />
        </div>
      </div>
      <h2 id={titleId} className="sr-only">
        {name}
      </h2>
    </div>
  );
}

export function PageContentDrawer({
  pageAccountId,
  mood,
  profileName,
  avatarUrl = null,
  config,
  stats,
  guilds = [],
}: PageContentDrawerProps) {
  const { isOpen, close } = usePageContentDrawer();
  const [closing, setClosing] = useState(false);
  const sheetOpen = isOpen && !closing;

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    close();
  }, [close]);

  const sections = resolvePageSections(config);
  const panelStyle = pageContentDrawerPanelStyle(mood.cssVars) as CSSProperties;

  useScrollLock(isOpen || closing);

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="mood-thread"
      moodId={mood.id}
      panelStyle={panelStyle}
      zIndex={48}
      ariaLabelledBy="page-drawer-title"
      backdropLabel="Close page"
      bodyClassName="page-drawer-body"
      header={
        <>
          <PageDrawerHeader
            pageAccountId={pageAccountId}
            profileName={profileName}
            avatarUrl={avatarUrl}
            titleId="page-drawer-title"
            onClose={requestClose}
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <PageContentSections sections={sections} stats={stats} guilds={guilds} />
    </GlassSheet>
  );
}
