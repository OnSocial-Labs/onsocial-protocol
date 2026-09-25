'use client';

import { useEffect, useState } from 'react';
import { Divider } from '@onsocial/ui';
import { fetchCollectionsByCreatorPage } from '@/features/scarces/collections-data';
import {
  loadPinnedSongChoices,
  type PinnedSongChoice,
} from '@/lib/pinned-song-choices';

export function PortfolioCustomizeSong({
  accountId,
  songId,
  disabled,
  onChange,
}: {
  accountId: string;
  songId: string | null;
  disabled: boolean;
  onChange: (songId: string | null) => void;
}) {
  const [titles, setTitles] = useState<PinnedSongChoice[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPinnedSongChoices((offset, limit) =>
      fetchCollectionsByCreatorPage(accountId, { offset, limit })
    )
      .then((next) => {
        if (cancelled) return;
        setTitles(next);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (!ready || (titles.length === 0 && !songId)) return null;

  return (
    <>
      <Divider variant="section" className="customize-sheet-divider" />
      <div className="customize-sheet-section">
        <div className="customize-song-head">
          <p className="customize-sheet-label">Song</p>
          {songId ? (
            <button
              type="button"
              className="customize-song-clear"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              Clear
            </button>
          ) : null}
        </div>
        {titles.length > 0 ? (
          <div className="customize-song-list">
            {titles.map((entry) => {
              const selected = entry.id === songId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`customize-song-row${selected ? ' is-selected' : ''}`}
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => onChange(selected ? null : entry.id)}
                >
                  {entry.title}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
}
