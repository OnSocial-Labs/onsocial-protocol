'use client';

import { useEffect, useMemo, useState } from 'react';
import { Divider } from '@onsocial/ui';
import { loadPortfolioSongChoices } from '@/lib/pinned-song-catalog';
import {
  filterPinnedSongChoices,
  type PinnedSongChoice,
} from '@/lib/pinned-song-choices';

const FIND_AFTER = 6;

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
  const [choices, setChoices] = useState<PinnedSongChoice[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');

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

  const visible = useMemo(
    () => filterPinnedSongChoices(choices, query, songId),
    [choices, query, songId]
  );
  const released = visible.filter((entry) => entry.source === 'released');
  const collected = visible.filter((entry) => entry.source === 'collected');
  const showGroups =
    choices.some((entry) => entry.source === 'released') &&
    choices.some((entry) => entry.source === 'collected');

  if (!ready || (choices.length === 0 && !songId)) return null;

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
        {choices.length > FIND_AFTER ? (
          <input
            className="customize-song-find"
            type="search"
            value={query}
            placeholder="Find"
            aria-label="Find a song"
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
          />
        ) : null}
        {visible.length > 0 ? (
          <div className="customize-song-list">
            <SongGroup
              label="Released"
              showLabel={showGroups && released.length > 0}
              entries={released}
              songId={songId}
              disabled={disabled}
              onChange={onChange}
            />
            <SongGroup
              label="Collected"
              showLabel={showGroups && collected.length > 0}
              entries={collected}
              songId={songId}
              disabled={disabled}
              onChange={onChange}
            />
          </div>
        ) : (
          <p className="customize-song-empty">Nothing matches.</p>
        )}
      </div>
    </>
  );
}

function SongGroup({
  label,
  showLabel,
  entries,
  songId,
  disabled,
  onChange,
}: {
  label: string;
  showLabel: boolean;
  entries: readonly PinnedSongChoice[];
  songId: string | null;
  disabled: boolean;
  onChange: (songId: string | null) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <>
      {showLabel ? <p className="customize-song-group">{label}</p> : null}
      {entries.map((entry) => {
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
            <span className="customize-song-title">{entry.title}</span>
            {entry.source === 'collected' && entry.creatorId ? (
              <span className="customize-song-by">{entry.creatorId}</span>
            ) : null}
          </button>
        );
      })}
    </>
  );
}
