'use client';

import { useEffect, useMemo, useState } from 'react';
import { Divider } from '@onsocial/ui';
import { loadPortfolioBookChoices } from '@/lib/pinned-book-catalog';
import {
  filterPinnedBookChoices,
  type PinnedBookChoice,
} from '@/lib/pinned-book-choices';

const FIND_AFTER = 6;

export function PortfolioCustomizeBook({
  accountId,
  bookId,
  disabled,
  onChange,
}: {
  accountId: string;
  bookId: string | null;
  disabled: boolean;
  onChange: (bookId: string | null) => void;
}) {
  const [choices, setChoices] = useState<PinnedBookChoice[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadPortfolioBookChoices(accountId)
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
    () => filterPinnedBookChoices(choices, query, bookId),
    [choices, query, bookId]
  );
  const released = visible.filter((entry) => entry.source === 'released');
  const collected = visible.filter((entry) => entry.source === 'collected');
  const showGroups =
    choices.some((entry) => entry.source === 'released') &&
    choices.some((entry) => entry.source === 'collected');

  if (!ready || (choices.length === 0 && !bookId)) return null;

  return (
    <>
      <Divider variant="section" className="customize-sheet-divider" />
      <div className="customize-sheet-section">
        <div className="customize-song-head">
          <p className="customize-sheet-label">Book</p>
          {bookId ? (
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
            aria-label="Find a book"
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
          />
        ) : null}
        {visible.length > 0 ? (
          <div className="customize-song-list">
            <BookGroup
              label="Released"
              showLabel={showGroups && released.length > 0}
              entries={released}
              bookId={bookId}
              disabled={disabled}
              onChange={onChange}
            />
            <BookGroup
              label="Collected"
              showLabel={showGroups && collected.length > 0}
              entries={collected}
              bookId={bookId}
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

function BookGroup({
  label,
  showLabel,
  entries,
  bookId,
  disabled,
  onChange,
}: {
  label: string;
  showLabel: boolean;
  entries: readonly PinnedBookChoice[];
  bookId: string | null;
  disabled: boolean;
  onChange: (bookId: string | null) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <>
      {showLabel ? <p className="customize-song-group">{label}</p> : null}
      {entries.map((entry) => {
        const selected = entry.id === bookId;
        const format = entry.format === 'issue' ? 'Issue' : 'Book';
        const byline =
          entry.source === 'collected' && entry.creatorId
            ? `${format} · ${entry.creatorId}`
            : format;
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
            <span className="customize-song-by">{byline}</span>
          </button>
        );
      })}
    </>
  );
}
