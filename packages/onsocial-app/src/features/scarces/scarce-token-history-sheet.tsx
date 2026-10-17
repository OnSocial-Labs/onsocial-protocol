'use client';

import { useEffect, useMemo, useState } from 'react';
import { OsHugSheet } from '@onsocial/ui';
import { CollectionActivityRows } from '@/features/scarces/collection-activity-rows';
import { CollectionActivitySkeleton } from '@/features/scarces/collection-page-skeleton';
import {
  mapTokenHistoryRows,
  type TokenHistoryEvent,
} from '@/features/scarces/scarce-token-history';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { SHEET_Z } from '@/lib/sheet-z';

type HistoryPhase = 'loading' | 'ready' | 'error';

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
  const [phase, setPhase] = useState<HistoryPhase>('loading');
  const [rows, setRows] = useState<ReturnType<typeof mapTokenHistoryRows>>([]);

  useEffect(() => {
    if (!open) return;
    if (!id) {
      setRows([]);
      setPhase('ready');
      return;
    }
    let cancelled = false;
    setRows([]);
    setPhase('loading');
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const history: TokenHistoryEvent[] =
          await client.query.scarces.tokenHistory(id, { limit: 200 });
        if (cancelled) return;
        setRows(mapTokenHistoryRows(history));
        setPhase('ready');
      } catch {
        if (cancelled) return;
        setRows([]);
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, id]);

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
      copy={heading}
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
        <CollectionActivityRows rows={rows} profiles={profiles} />
      ) : (
        <p className="collection-activity-empty">No history yet.</p>
      )}
    </OsHugSheet>
  );
}

/**
 * Quiet History control for a listing that is one edition.
 * Sits in the action column, above the stretched row link.
 */
export function ScarceEditionHistoryButton({
  tokenId,
  title,
}: {
  tokenId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const label = title.trim() || 'Scarce';
  const id = tokenId.trim();
  if (!id) return null;

  return (
    <>
      <button
        type="button"
        className="market-listing-history"
        aria-label={`History for ${label}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        History
      </button>
      <ScarceTokenHistorySheet
        open={open}
        onClose={() => setOpen(false)}
        tokenId={id}
        title={label}
      />
    </>
  );
}
