'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { usePageContentDrawer } from '@/contexts/page-content-drawer-context';
import { PageContentSections } from '@/components/portfolio/page-content-sections';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
import { moodDrawerThreadVars } from '@/lib/moods/resolve';
import { displayName } from '@/lib/profile-display';
import { resolvePageSections } from '@/lib/page-sections';
import type { PublicPageConfig, PublicPageStats } from '@/lib/page-data';
import type { ResolvedMood } from '@/lib/moods/types';

interface PageContentDrawerProps {
  pageAccountId: string;
  profileName?: string | null;
  config: PublicPageConfig;
  stats: PublicPageStats;
  mood: ResolvedMood;
}

export function PageContentDrawer({
  pageAccountId,
  profileName,
  config,
  stats,
  mood,
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
  const title = displayName(pageAccountId, profileName ?? undefined);

  useScrollLock(isOpen || closing);

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="mood-thread"
      moodId={mood.id}
      zIndex={48}
      ariaLabelledBy="page-drawer-title"
      backdropLabel="Close page"
      panelStyle={moodDrawerThreadVars(mood.cssVars) as CSSProperties}
      bodyClassName="page-drawer-body"
      header={
        <>
          <SheetHeader
            titleId="page-drawer-title"
            title={title}
            subtitle={`@${pageAccountId}`}
            onClose={requestClose}
            closeAriaLabel="Close page"
            className="page-drawer-header"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <PageContentSections sections={sections} stats={stats} />
    </GlassSheet>
  );
}
