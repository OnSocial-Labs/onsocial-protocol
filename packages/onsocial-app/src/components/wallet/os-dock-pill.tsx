'use client';

import { cloneElement, isValidElement, type ReactNode } from 'react';
import { Divider, osDockPillClassName } from '@onsocial/ui';
import { useWriteDockHasDraft } from '@/contexts/compose-launcher-context';
import { OsDockAccountZone } from '@/components/wallet/os-dock-account-zone';
import { OsDockActivityZone } from '@/components/wallet/os-dock-activity-zone';

function dockBackWithVariant(
  navBack: ReactNode,
  variant: 'segment' | 'stacked'
): ReactNode {
  if (!navBack || !isValidElement<{ variant?: 'segment' | 'stacked' }>(navBack)) {
    return navBack;
  }
  return cloneElement(navBack, { variant });
}

interface OsDockPillProps {
  pageAccountId?: string;
  /** Contextual back — leading segment at rest; stacks under avatar once compose opens. */
  navBack?: ReactNode;
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
  /** Launcher pill shape while the write dock is open. */
  writeMorph?: 'idle' | 'tools' | 'expanded';
}

/**
 * Unified OS dock — [activity] | [account] | grip | optional now-playing |
 * | [compose]. Write mode drops activity + grip:
 * [back | avatar | type] at rest; [avatar over back] | [type + footer] on first focus.
 */
export function OsDockPill({
  pageAccountId,
  navBack,
  grip,
  nowPlaying,
  action,
  write,
  writeMorph = 'idle',
}: OsDockPillProps) {
  const writeDockHasDraft = useWriteDockHasDraft();
  const writing = Boolean(write);
  const composeOpen = writeMorph !== 'idle' || writeDockHasDraft;
  const backLeading = Boolean(navBack) && writing && !composeOpen;
  const backStacked = Boolean(navBack) && writing && composeOpen;
  if (writing) {
    return (
      <div
        className={`${osDockPillClassName} portfolio-summon is-writing${
          writeMorph === 'tools' ? ' is-compose-tools' : ''
        }${writeMorph === 'expanded' ? ' is-compose-expanded' : ''}${
          backLeading ? ' has-dock-back' : ''
        }${backStacked ? ' has-dock-back-stacked' : ''}`}
      >
        {backLeading ? dockBackWithVariant(navBack, 'segment') : null}
        {backLeading ? (
          <Divider
            orientation="vertical"
            variant="detail"
            className="portfolio-summon-divider"
          />
        ) : null}
        {backStacked ? (
          <div className="portfolio-summon-account-column">
            <OsDockAccountZone pageAccountId={pageAccountId} />
            {dockBackWithVariant(navBack, 'stacked')}
          </div>
        ) : (
          <OsDockAccountZone pageAccountId={pageAccountId} />
        )}
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
    <div
      className={`${osDockPillClassName} portfolio-summon${
        navBack ? ' has-dock-back' : ''
      }`}
    >
      {navBack}
      {navBack ? (
        <Divider
          orientation="vertical"
          variant="detail"
          className="portfolio-summon-divider"
        />
      ) : null}
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
