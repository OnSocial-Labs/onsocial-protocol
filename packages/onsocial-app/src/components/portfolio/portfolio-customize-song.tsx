'use client';

import { useEffect, useState } from 'react';
import { Divider } from '@onsocial/ui';
import { fetchCollectionsByCreator } from '@/features/scarces/collections-data';
import { isAudioMediumKind } from '@/features/market/market-medium';

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
  const [titles, setTitles] = useState<Array<{ id: string; title: string }>>(
    []
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void fetchCollectionsByCreator(accountId, { limit: 48 }).then((views) => {
      if (cancelled) return;
      setTitles(
        views
          .filter(
            (view) => isAudioMediumKind(view.kind) && view.playables.length > 0
          )
          .map((view) => ({ id: view.collectionId, title: view.title }))
      );
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (!ready || titles.length === 0) return null;

  return (
    <>
      <Divider variant="section" className="customize-sheet-divider" />
      <div className="customize-sheet-section">
        <p className="customize-sheet-label">Song</p>
        <div className="customize-song-list" role="list">
          {titles.map((entry) => {
            const selected = entry.id === songId;
            return (
              <button
                key={entry.id}
                type="button"
                role="listitem"
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
      </div>
    </>
  );
}
