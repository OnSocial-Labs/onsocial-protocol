'use client';

import { useEffect, useState } from 'react';
import { fetchCollectionPreferIndexer } from '@/features/scarces/collections-data';
import { ticketEventScheduleFacts } from '@/features/scarces/ticket-event-facts';
import { passStaffVoice } from '@/features/scarces/ticket-pass-payload';
import { TicketShowPassSheet } from '@/features/scarces/ticket-show-pass-sheet';

/**
 * Show pass over the page that opened it (Collectibles, Market).
 * Closing returns to that page. Event time and place fill in when the
 * drop record arrives; the sheet does not wait on that fetch.
 */
export function OwnedShowPassSheet({
  open,
  onClose,
  title,
  cover = null,
  collectionId,
  tokenId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  cover?: string | null;
  collectionId: string;
  tokenId: string;
}) {
  const id = collectionId.trim();
  const [schedule, setSchedule] = useState<{
    key: string;
    title: string;
    cover: string | null;
    eventEndsAtMs: number | null;
    when: string | null;
    place: string | null;
    kind: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open || !id) return;
    let cancelled = false;
    void fetchCollectionPreferIndexer(id).then((view) => {
      if (cancelled || !view) return;
      const facts = ticketEventScheduleFacts(view, Date.now());
      setSchedule({
        key: id,
        title: view.title.trim() || title,
        cover: view.mediaUrl,
        eventEndsAtMs: view.eventEndsAtMs,
        when: facts.when,
        place: facts.place,
        kind: view.kind,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [id, open, title]);

  const facts = schedule?.key === id ? schedule : null;

  return (
    <TicketShowPassSheet
      open={open}
      onClose={onClose}
      title={facts?.title || title}
      cover={facts?.cover || cover}
      collectionId={id}
      tokenId={tokenId}
      eventEndsAtMs={facts?.eventEndsAtMs ?? null}
      whenLabel={facts?.when ?? null}
      placeLabel={facts?.place ?? null}
      voice={facts ? passStaffVoice(facts.kind) : undefined}
    />
  );
}
