'use client';

import { useEffect, useMemo, useState } from 'react';
import { txToastSuccess } from '@/lib/transaction-toast-copy';
import { loadPortfolioSongChoices } from '@/lib/pinned-song-catalog';
import type { PinnedSongChoice } from '@/lib/pinned-song-choices';
import {
  PortfolioCustomizePin,
  type CustomizePinChoice,
} from '@/components/portfolio/portfolio-customize-pin';

function songByline(entry: PinnedSongChoice): string | null {
  return entry.creatorId ? `@${entry.creatorId}` : null;
}

export function PortfolioCustomizeSong({
  accountId,
  songId,
  songStart = null,
  disabled,
  note,
  onSave,
}: {
  accountId: string;
  songId: string | null;
  songStart?: number | null;
  disabled: boolean;
  note?: string | null;
  onSave: (
    songId: string | null,
    songStart?: number | null
  ) => Promise<string | null>;
}) {
  const [choices, setChoices] = useState<PinnedSongChoice[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPortfolioSongChoices(accountId)
      .then((next) => {
        if (cancelled) return;
        setChoices(next);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const pins = useMemo<CustomizePinChoice[]>(
    () =>
      choices.map((entry) => ({
        id: entry.id,
        title: entry.title,
        source: entry.source,
        byline: songByline(entry),
        search: [
          entry.creatorId,
          ...(entry.tracks ?? []).map((track) => track.title),
        ]
          .filter(Boolean)
          .join(' '),
        mediaUrl: entry.mediaUrl ?? null,
        ...(entry.tracks ? { tracks: entry.tracks } : {}),
      })),
    [choices]
  );

  return (
    <PortfolioCustomizePin
      label="Song"
      sheetTitle="Song"
      noneLabel="No song"
      findLabel="Find a song"
      pinnedId={songId}
      pinnedStart={songStart}
      savedMessage={txToastSuccess.songSaved}
      choices={pins}
      ready={ready}
      disabled={disabled}
      note={note}
      onSave={onSave}
    />
  );
}
