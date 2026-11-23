'use client';

import { useEffect, useState } from 'react';
import { passStaffVoice } from '@/features/scarces/ticket-pass-payload';
import {
  peekShowPassSchedule,
  prefetchShowPass,
  type ShowPassScheduleAhead,
} from '@/features/scarces/show-pass-ahead';
import { TicketShowPassSheet } from '@/features/scarces/ticket-show-pass-sheet';

type ScheduleState = ShowPassScheduleAhead & { key: string };

/**
 * Show pass over the page that opened it (Collectibles, Market).
 * Closing returns to that page. Prefetch while the holding is on screen;
 * open paints schedule from that cache — the sheet does not wait on it.
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
  const [schedule, setSchedule] = useState<ScheduleState | null>(() => {
    const peeked = peekShowPassSchedule(id);
    return peeked ? { key: id, ...peeked } : null;
  });

  useEffect(() => {
    if (!id || !tokenId.trim()) return;
    let cancelled = false;
    const peeked = peekShowPassSchedule(id);
    if (peeked) {
      setSchedule({ key: id, ...peeked });
    }
    void prefetchShowPass({
      collectionId: id,
      tokenId,
      seedTitle: title,
      seedCover: cover,
      revalidateStatus: open,
    }).then((ahead) => {
      if (cancelled || !ahead.schedule) return;
      setSchedule({ key: id, ...ahead.schedule });
    });
    return () => {
      cancelled = true;
    };
  }, [cover, id, open, title, tokenId]);

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
