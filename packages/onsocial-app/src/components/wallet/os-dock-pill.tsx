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
   * returns null when idle. Hidden while the action slot is a write dock.
   */
  nowPlaying?: ReactNode;
  /** Optional trailing segment, e.g. the compose pen on composable surfaces. */
  action?: ReactNode;
  /** Compact write bar — grows the pill and replaces now-playing + pen. */
  write?: ReactNode;
}

/**
 * Unified OS dock — [activity] | [account] | grip | optional now-playing |
 * | [compose]. Write mode drops activity + grip:
 * [avatar] | [type]; media and expand after open; send when ready.
 */
export function OsDockPill({
  pageAccountId,
  grip,
  nowPlaying,
  action,
  write,
}: OsDockPillProps) {
  const writing = Boolean(write);
  if (writing) {
    return (
      <div className={`${osDockPillClassName} portfolio-summon is-writing`}>
        <OsDockAccountZone pageAccountId={pageAccountId} />
        <Divider
          orientation="vertical"
          variant="detail"
          className="portfolio-summon-divider"
        />
        {write}
      </div>
    );
  }

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
