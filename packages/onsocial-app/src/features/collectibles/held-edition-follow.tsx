'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { HeldEditionsSheet } from '@/features/collectibles/held-editions-sheet';
import {
  collectionIdFromTokenId,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { fetchCollectionPreferIndexer } from '@/features/scarces/collections-data';
import { listedArticleReaderHref } from '@/features/scarces/drop-writing';
import { OwnedShowPassSheet } from '@/features/scarces/owned-show-pass-sheet';
import { WritingReadSheet } from '@/features/scarces/scarce-writing-read-sheet';
import { heldEditionDestination } from '@/lib/portfolio-holdings';

/**
 * Edition list plus the same next step one copy already takes.
 * A pass stays on this page. Read opens the reader. Play and Open follow the link.
 */
export function HeldEditionFollow({
  open,
  title,
  editions,
  choose = 'open',
  onClose,
  onTransfer,
  onSell,
}: {
  open: boolean;
  title: string;
  editions: OwnedScarceItem[];
  choose?: 'open' | 'send';
  onClose: () => void;
  onTransfer?: (item: OwnedScarceItem) => void;
  onSell?: (item: OwnedScarceItem) => void;
}) {
  const router = useRouter();
  const { accountId } = useAppWallet();
  const [pass, setPass] = useState<OwnedScarceItem | null>(null);
  const [reader, setReader] = useState<OwnedScarceItem | null>(null);

  const followOpen = (item: OwnedScarceItem) => {
    const destination = heldEditionDestination(item);
    if (destination.type === 'pass') {
      setPass(item);
      return;
    }
    if (destination.type === 'article') {
      router.push(destination.href);
      return;
    }
    if (destination.type === 'reader') {
      const collectionId =
        item.collectionId?.trim() ||
        collectionIdFromTokenId(item.tokenId) ||
        '';
      if (!collectionId) return;
      void fetchCollectionPreferIndexer(collectionId)
        .then((view) => {
          const href = listedArticleReaderHref({
            writingFormat: view?.writingFormat,
            sourcePostPath: view?.sourcePostPath ?? item.sourcePostPath,
          });
          if (href) {
            router.push(href);
            return;
          }
          setReader(item);
        })
        .catch(() => setReader(item));
      return;
    }
    if (destination.href) router.push(destination.href);
  };

  const readerId =
    reader?.collectionId?.trim() ||
    (reader ? collectionIdFromTokenId(reader.tokenId) : '') ||
    '';

  return (
    <>
      <HeldEditionsSheet
        open={open}
        title={title}
        editions={editions}
        choose={choose}
        onClose={onClose}
        onChoose={(item) => {
          if (choose === 'send') {
            onTransfer?.(item);
            return;
          }
          followOpen(item);
        }}
        onTransfer={onTransfer}
        onSell={onSell}
      />
      {pass ? (
        <OwnedShowPassSheet
          open
          onClose={() => setPass(null)}
          title={pass.title}
          cover={pass.mediaUrl}
          collectionId={
            pass.collectionId?.trim() ||
            collectionIdFromTokenId(pass.tokenId) ||
            ''
          }
          tokenId={pass.tokenId}
        />
      ) : null}
      {reader && readerId ? (
        <WritingReadSheet
          open
          onClose={() => setReader(null)}
          title={reader.title}
          cover={reader.mediaUrl}
          collectionId={readerId}
          accountId={accountId}
          creatorId={reader.creatorId}
          readables={[]}
          canRead
          lockedHint=""
          publishedAt={
            reader.mintedAtMs != null && reader.mintedAtMs > 0
              ? reader.mintedAtMs
              : null
          }
        />
      ) : null}
    </>
  );
}
