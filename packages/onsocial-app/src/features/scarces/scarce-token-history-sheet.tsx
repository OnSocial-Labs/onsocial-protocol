'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { OsHugSheet } from '@onsocial/ui';
import { heldEditionMark } from '@/features/collectibles/held-editions';
import { CollectionActivityRows } from '@/features/scarces/collection-activity-rows';
import { CollectionActivitySkeleton } from '@/features/scarces/collection-page-skeleton';
import {
  mapTokenHistoryRows,
  TOKEN_HISTORY_OMIT_OPERATIONS,
  type TokenHistoryEvent,
} from '@/features/scarces/scarce-token-history';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { OsLoadMore } from '@/lib/os-load-more';
import { SHEET_Z } from '@/lib/sheet-z';

type HistoryPhase = 'loading' | 'ready' | 'error';

/** First screen. Older loads the next page, back to the mint. */
const HISTORY_PAGE = 40;

async function fetchHistoryPage(
  tokenId: string,
  offset: number
): Promise<{ events: TokenHistoryEvent[]; hasOlder: boolean }> {
  const client = createReadOnlyOnSocialClient();
  const page = await client.query.scarces.tokenHistory(tokenId, {
    limit: HISTORY_PAGE + 1,
    offset,
    newestFirst: true,
    omitOperations: TOKEN_HISTORY_OMIT_OPERATIONS,
  });
  return {
    events: page.slice(0, HISTORY_PAGE),
    hasOlder: page.length > HISTORY_PAGE,
  };
}

/** Edition timeline — same standing rows as drop activity. */
export function ScarceTokenHistorySheet({
  open,
  onClose,
  tokenId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  tokenId: string;
  title: string;
}) {
  const id = tokenId.trim();
  const heading = title.trim() || 'Scarce';
  const mark = id ? heldEditionMark(id) : null;
  const [trackedId, setTrackedId] = useState(id);
  const [phase, setPhase] = useState<HistoryPhase>(id ? 'loading' : 'ready');
  const [events, setEvents] = useState<TokenHistoryEvent[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const fetchedRef = useRef(0);
  const generationRef = useRef(0);

  if (trackedId !== id) {
    setTrackedId(id);
    setPhase(id ? 'loading' : 'ready');
    setEvents([]);
    setHasOlder(false);
    setLoadingOlder(false);
    fetchedRef.current = 0;
  }

  useEffect(() => {
    if (!open || !id) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const token = id;
    void (async () => {
      try {
        const page = await fetchHistoryPage(token, 0);
        if (generationRef.current !== generation) return;
        fetchedRef.current = page.events.length;
        setEvents(page.events);
        setHasOlder(page.hasOlder);
        setPhase('ready');
      } catch {
        if (generationRef.current !== generation) return;
        fetchedRef.current = 0;
        setEvents([]);
        setHasOlder(false);
        setPhase('error');
      }
    })();
    return () => {
      generationRef.current += 1;
    };
  }, [open, id]);

  const loadOlder = () => {
    if (!id || phase !== 'ready' || loadingOlder || !hasOlder) return;
    const generation = generationRef.current;
    const offset = fetchedRef.current;
    setLoadingOlder(true);
    void (async () => {
      try {
        const page = await fetchHistoryPage(id, offset);
        if (generationRef.current !== generation) return;
        fetchedRef.current = offset + page.events.length;
        setEvents((prev) => [...prev, ...page.events]);
        setHasOlder(page.hasOlder);
      } catch {
        if (generationRef.current !== generation) return;
      } finally {
        if (generationRef.current === generation) setLoadingOlder(false);
      }
    })();
  };

  const rows = useMemo(() => mapTokenHistoryRows(events, id), [events, id]);
  const actors = useMemo(
    () => rows.map((row) => row.actor?.trim() || '').filter(Boolean),
    [rows]
  );
  const profiles = usePostAuthorProfiles(open ? actors : []);

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label="History"
      copy={mark ? `${heading} ${mark}` : heading}
      closeAriaLabel="Close history"
      backdropLabel="Close history"
      zIndex={SHEET_Z.overShell}
      panelClassName="collection-activity-sheet-panel os-sheet-cap-standard"
      bodyClassName="collection-activity-sheet-body"
    >
      {phase === 'loading' ? (
        <CollectionActivitySkeleton rows={6} label="Loading history" />
      ) : phase === 'error' ? (
        <p className="collection-activity-empty">
          History isn&apos;t available right now.
        </p>
      ) : rows.length > 0 ? (
        <>
          <CollectionActivityRows rows={rows} profiles={profiles} />
          {hasOlder ? (
            <OsLoadMore onClick={loadOlder} pending={loadingOlder}>
              Older
            </OsLoadMore>
          ) : null}
        </>
      ) : (
        <p className="collection-activity-empty">No history yet.</p>
      )}
    </OsHugSheet>
  );
}
