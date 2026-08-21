'use client';

import type { ReactNode } from 'react';
import { Divider, osDockPillClassName } from '@onsocial/ui';
import { OsDockAccountZone } from '@/components/wallet/os-dock-account-zone';
import { OsDockActivityZone } from '@/components/wallet/os-dock-activity-zone';

interface OsDockPillProps {
  pageAccountId?: string;
  grip: ReactNode;
  /**
   * Optional now-playing segment (between grip and compose).
   * Pass `CollectiblesNowPlayingDockChip` — it owns its leading divider and
   * returns null when idle.
   */
  nowPlaying?: ReactNode;
  /** Optional trailing segment, e.g. the compose pen on composable surfaces. */
  action?: ReactNode;
}

/**
 * Unified OS dock — Activity (when connected), account, summon grip,
 * optional now-playing, optional compose.
 */
export function OsDockPill({
  pageAccountId,
  grip,
  nowPlaying,
  action,
}: OsDockPillProps) {
  return (
    <div className={`${osDockPillClassName} portfolio-summon`}>
      <OsDockActivityZone />
      <OsDockAccountZone pageAccountId={pageAccountId} />
      <Divider
        orientation="vertical"
        variant="detail"
        className="portfolio-summon-divider"
      />
      {grip}
      {nowPlaying}
      {action ? (
        <>
          <Divider
            orientation="vertical"
            variant="detail"
            className="portfolio-summon-divider"
          />
          {action}
        </>
      ) : null}
    </div>
  );
}
