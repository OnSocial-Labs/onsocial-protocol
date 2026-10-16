'use client';

import { useEffect, useState } from 'react';
import { OsRowAction } from '@/lib/os-row-action';
import { ScarceFansSheet } from '@/features/scarces/scarce-fans-sheet';
import type { PassStaffVoice } from '@/features/scarces/ticket-pass-payload';
import {
  eventGuestSheetCopy,
  eventGuestTallyLine,
  loadEventCheckInIds,
  loadEventHolderIds,
  type EventGuestKind,
} from '@/features/events/event-guests';
import { SHEET_Z } from '@/lib/sheet-z';

const LIVE_MS = 12_000;

function useGuestIds(
  collectionId: string,
  kind: EventGuestKind,
  active: boolean,
  refreshMs: number
): { ids: string[] | null; error: boolean } {
  const key = `${collectionId.trim()}\0${kind}`;
  const [pack, setPack] = useState<{
    key: string;
    ids: string[] | null;
    error: boolean;
  }>({ key: '', ids: null, error: false });

  useEffect(() => {
    if (!active || !collectionId.trim()) return;
    let cancelled = false;
    const load = () => {
      const run = kind === 'going' ? loadEventHolderIds : loadEventCheckInIds;
      void run(collectionId)
        .then((ids) => {
          if (cancelled) return;
          setPack({ key, ids, error: false });
        })
        .catch(() => {
          if (cancelled) return;
          setPack((current) =>
            current.key === key && current.ids
              ? current
              : { key, ids: null, error: true }
          );
        });
    };
    load();
    if (refreshMs <= 0) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, collectionId, key, kind, refreshMs]);

  if (pack.key !== key) return { ids: null, error: false };
  return { ids: pack.ids, error: pack.error };
}

/**
 * Who's in — the same people list for guests and door staff.
 * On now refreshes so a check-in shows up without leaving the page.
 */
export function EventGuestsSheet({
  open,
  onClose,
  collectionId,
  title,
  kind,
  sold,
  voice = 'admit',
  ids,
  loading = false,
  error = false,
}: {
  open: boolean;
  onClose: () => void;
  collectionId: string;
  title: string;
  kind: EventGuestKind;
  sold: number | null;
  voice?: PassStaffVoice;
  /** When the parent already has the roster, skip a second read. */
  ids?: string[] | null;
  loading?: boolean;
  error?: boolean;
}) {
  const owned = ids === undefined;
  const fetched = useGuestIds(
    collectionId,
    kind,
    open && owned,
    open && owned && kind === 'in' ? LIVE_MS : 0
  );
  const roster = owned ? fetched.ids : ids;
  const rosterError = owned ? fetched.error : error;
  const rosterLoading = owned ? open && roster == null && !rosterError : loading;
  const copy = eventGuestSheetCopy(kind);
  const lede =
    roster != null
      ? eventGuestTallyLine({
          kind,
          present: roster.length,
          sold,
          redeemed: voice === 'redeem',
        })
      : null;

  return (
    <ScarceFansSheet
      open={open}
      onClose={onClose}
      fanIds={roster ?? []}
      fanCount={roster?.length ?? 0}
      dropTitle={title}
      lede={lede}
      idsLoading={rosterLoading}
      idsError={rosterError}
      frame="page"
      zIndex={SHEET_Z.list}
      label={copy.label}
      countSingular={copy.countSingular}
      countPlural={copy.countPlural}
      emptyCopy={copy.emptyCopy}
      errorCopy={copy.errorCopy}
      closeAriaLabel="Back"
      backdropLabel={copy.backdropLabel}
      searchPlaceholder={copy.searchPlaceholder}
      searchAriaLabel={copy.searchAriaLabel}
      searchClearAriaLabel={copy.searchClearAriaLabel}
    />
  );
}

/** Drop-page row. Everyone sees it. On now stays live. */
export function CollectionEventGuests({
  collectionId,
  title,
  sold,
  kind,
  voice,
}: {
  collectionId: string;
  title: string;
  sold: number;
  kind: EventGuestKind;
  voice: PassStaffVoice;
}) {
  const [open, setOpen] = useState(false);
  const roster = useGuestIds(
    collectionId,
    kind,
    true,
    kind === 'in' ? LIVE_MS : 0
  );
  const copy = eventGuestSheetCopy(kind);
  const tally =
    roster.ids != null
      ? eventGuestTallyLine({
          kind,
          present: roster.ids.length,
          sold,
          redeemed: voice === 'redeem',
        })
      : null;

  return (
    <section className="collection-reading" aria-label={copy.label}>
      <div className="collection-reading-row">
        <p className="collection-section-label collection-guest-tally">
          {tally ?? copy.label}
        </p>
        <OsRowAction onClick={() => setOpen(true)}>See who</OsRowAction>
      </div>
      <EventGuestsSheet
        open={open}
        onClose={() => setOpen(false)}
        collectionId={collectionId}
        title={title}
        kind={kind}
        sold={sold}
        voice={voice}
        ids={roster.ids}
        loading={roster.ids == null && !roster.error}
        error={roster.error}
      />
    </section>
  );
}
