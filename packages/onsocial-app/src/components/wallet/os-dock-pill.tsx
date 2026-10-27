'use client';

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Divider, osDockPillClassName } from '@onsocial/ui';
import { useWriteDockHasDraft } from '@/contexts/compose-launcher-context';
import { OsDockAccountZone } from '@/components/wallet/os-dock-account-zone';
import { OsDockActivityZone } from '@/components/wallet/os-dock-activity-zone';

/** Outgoing face unmounts once the incoming face has landed. */
const SWAP_UNMOUNT_MS = 200;

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
 *
 * Rest ↔ write swaps crossfade inside the persistent shell: the outgoing face
 * lingers as a fading overlay while the incoming face rises in, so the pen
 * never hard-cuts to the bar.
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

  const content = writing ? (
    <>
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
    </>
  ) : (
    <>
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
    </>
  );

  /* Snapshot the committed face so a mode flip can fade it out over the new one.
     The overlay only rides into write mode — the growing pill contains the old
     face's geometry. Back to rest the pill shrinks, so only the incoming face
     fades/rises (no overlay to squish into the narrower pill). */
  const committedContentRef = useRef(content);
  const [previousWriting, setPreviousWriting] = useState(writing);
  const [outgoing, setOutgoing] = useState<ReactNode>(null);
  const [swapping, setSwapping] = useState(false);
  if (previousWriting !== writing) {
    setPreviousWriting(writing);
    // eslint-disable-next-line react-hooks/refs -- read-only snapshot of the last committed face for the crossfade overlay; refreshed by the passive effect below on every commit
    setOutgoing(writing ? committedContentRef.current : null);
    setSwapping(true);
  }

  useEffect(() => {
    committedContentRef.current = content;
  });

  useEffect(() => {
    if (!swapping) return;
    const timer = window.setTimeout(() => {
      setSwapping(false);
      setOutgoing(null);
    }, SWAP_UNMOUNT_MS);
    return () => window.clearTimeout(timer);
  }, [outgoing, swapping]);

  const writingClass = writing
    ? ` is-writing${writeMorph === 'tools' ? ' is-compose-tools' : ''}${
        writeMorph === 'expanded' ? ' is-compose-expanded' : ''
      }${backLeading ? ' has-dock-back' : ''}${
        backStacked ? ' has-dock-back-stacked' : ''
      }`
    : `${navBack ? ' has-dock-back' : ''}`;

  return (
    <div
      className={`${osDockPillClassName} portfolio-summon${writingClass}${
        swapping ? ' is-crossfading' : ''
      }`}
    >
      {outgoing ? (
        <div className="os-dock-pill-swap-out" aria-hidden inert>
          {outgoing}
        </div>
      ) : null}
      {content}
    </div>
  );
}
