'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  Divider,
  OsHugSheet,
  SheetFactCopy,
  SheetFactRow,
  SheetFactSection,
} from '@onsocial/ui';
import { ticketEventScheduleFacts } from '@/features/scarces/ticket-event-facts';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';

export type ScarceAboutEvent = {
  eventStartsAtMs?: number | null;
  eventEndsAtMs?: number | null;
  place?: string | null;
};

/**
 * Full scarce description — same job as CollectionAboutSheet for Drop play.
 * Tickets also show Event (place / window) so resale matches the drop About.
 */
export function ScarceAboutSheet({
  open,
  onClose,
  title,
  body,
  originalHref = null,
  event = null,
  zIndex = SCARCE_Z.nestedOverCommerce,
}: {
  open: boolean;
  onClose: () => void;
  title?: string | null;
  body: string;
  originalHref?: string | null;
  event?: ScarceAboutEvent | null;
  zIndex?: number;
}) {
  const [closing, setClosing] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const sheetOpen = open && !closing;
  const trimmed = body.trim();
  const headerTitle = title?.trim() || 'About';
  const schedule = ticketEventScheduleFacts(
    {
      eventStartsAtMs: event?.eventStartsAtMs ?? null,
      eventEndsAtMs: event?.eventEndsAtMs ?? null,
      place: event?.place ?? null,
    },
    nowMs
  );
  const showEvent = !schedule.empty;

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  if (!trimmed && !open) return null;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="About"
      {...(headerTitle !== 'About' ? { copy: headerTitle } : {})}
      closeAriaLabel="Close about"
      backdropLabel="Close about"
      zIndex={zIndex}
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
    >
      <div className="guild-facts collection-about-sheet">
        {trimmed ? (
          <p className="collection-about-body">{trimmed}</p>
        ) : null}
        {showEvent ? (
          <>
            {trimmed ? <Divider variant="detail" /> : null}
            <SheetFactSection title="Event">
              {schedule.place ? (
                <SheetFactRow label="Place" value={schedule.place} />
              ) : null}
              {schedule.starts ? (
                <SheetFactRow label="Starts" value={schedule.starts} />
              ) : null}
              {schedule.ends ? (
                <SheetFactRow label="Ends" value={schedule.ends} />
              ) : null}
              {schedule.next ? (
                <SheetFactCopy>{schedule.next}</SheetFactCopy>
              ) : null}
            </SheetFactSection>
          </>
        ) : null}
        {originalHref ? (
          <>
            {trimmed || showEvent ? <Divider variant="detail" /> : null}
            <p className="scarce-provenance-original">
              <Link
                href={originalHref}
                scroll={false}
                className="scarce-provenance-original-link"
                onClick={requestClose}
              >
                View original post
              </Link>
            </p>
          </>
        ) : null}
      </div>
    </OsHugSheet>
  );
}
