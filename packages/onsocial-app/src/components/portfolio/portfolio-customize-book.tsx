'use client';

import { useEffect, useMemo, useState } from 'react';
import { txToastSuccess } from '@/lib/transaction-toast-copy';
import { loadPortfolioBookChoices } from '@/lib/pinned-book-catalog';
import type { PinnedBookChoice } from '@/lib/pinned-book-choices';
import {
  PortfolioCustomizePin,
  type CustomizePinChoice,
} from '@/components/portfolio/portfolio-customize-pin';

function bookByline(entry: PinnedBookChoice): string | null {
  const format = entry.format === 'issue' ? 'Issue' : 'Book';
  return entry.source === 'collected' && entry.creatorId
    ? `${format} · @${entry.creatorId}`
    : format;
}

export function PortfolioCustomizeBook({
  accountId,
  bookId,
  disabled,
  note,
  onSave,
}: {
  accountId: string;
  bookId: string | null;
  disabled: boolean;
  note?: string | null;
  onSave: (bookId: string | null) => Promise<string | null>;
}) {
  const [choices, setChoices] = useState<PinnedBookChoice[]>([]);
  const [ready, setReady] = useState(false);

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

  const pins = useMemo<CustomizePinChoice[]>(
    () =>
      choices.map((entry) => ({
        id: entry.id,
        title: entry.title,
        source: entry.source,
        byline: bookByline(entry),
        search: entry.creatorId,
        mediaUrl: entry.mediaUrl ?? null,
      })),
    [choices]
  );

  return (
    <PortfolioCustomizePin
      label="Book"
      sheetTitle="Book"
      noneLabel="No book"
      findLabel="Find a book"
      pinnedId={bookId}
      savedMessage={txToastSuccess.bookSaved}
      choices={pins}
      ready={ready}
      disabled={disabled}
      note={note}
      onSave={onSave}
    />
  );
}
