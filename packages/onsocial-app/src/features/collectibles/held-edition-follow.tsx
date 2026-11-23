'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { HeldEditionsSheet } from '@/features/collectibles/held-editions-sheet';
import { seedCollectionViewFromOwnedPass } from '@/features/market/market-drop-open';
import {
  collectionIdFromTokenId,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { fetchCollectionPreferIndexer } from '@/features/scarces/collections-data';
import { useDropPlaceOpen } from '@/features/scarces/drop-place-open';
import { OwnedShowPassSheet } from '@/features/scarces/owned-show-pass-sheet';
import { prefetchShowPass } from '@/features/scarces/show-pass-ahead';
import { isPassMediumKind } from '@/features/scarces/ticket-pass-payload';
import { WritingReadSheet } from '@/features/scarces/scarce-writing-read-sheet';
import { parseInAppDropLayerHref } from '@/lib/app-routes';
import {
  heldEditionBrowseHref,
  heldEditionDestination,
} from '@/lib/portfolio-holdings';

/** Edition list: face soft-navs to the drop place; use pill does pass / play / read. */
export function HeldEditionFollow({
  open,
  title,
  editions,
  choose = 'open',
  onClose,
  onTransfer,
  onSell,
  renderOwnerMenu,
}: {
  open: boolean;
  title: string;
  editions: OwnedScarceItem[];
  choose?: 'open' | 'send';
  onClose: () => void;
  onTransfer?: (item: OwnedScarceItem) => void;
  onSell?: (item: OwnedScarceItem) => void;
  /** Listed copies swap the row menu for the owner's sale manage menu. */
  renderOwnerMenu?: (item: OwnedScarceItem) => ReactNode;
}) {
  const router = useRouter();
  const openDrop = useDropPlaceOpen();
  const { accountId } = useAppWallet();
  const [pass, setPass] = useState<OwnedScarceItem | null>(null);
  const [reader, setReader] = useState<OwnedScarceItem | null>(null);
  const [readerCreatorId, setReaderCreatorId] = useState<string | null>(null);
  const [readerSourcePostPath, setReaderSourcePostPath] = useState<
    string | null
  >(null);

  const openOwnedDrop = (item: OwnedScarceItem, href: string) => {
    openDrop({
      href,
      initial: seedCollectionViewFromOwnedPass({
        collectionId:
          item.collectionId?.trim() ||
          collectionIdFromTokenId(item.tokenId) ||
          null,
        title: item.title,
        mediaUrl: item.mediaUrl,
        creatorId: item.creatorId,
        mediumKind: item.mediumKind,
        audioFormat: item.audioFormat ?? null,
      }),
    });
    onClose();
  };

  const followBrowse = (item: OwnedScarceItem) => {
    const href = heldEditionBrowseHref(item);
    if (!href) return;
    if (parseInAppDropLayerHref(href)) {
      openOwnedDrop(item, href);
      return;
    }
    router.push(href);
  };

  // Warm pass rows while the edition list is open.
  useEffect(() => {
    if (!open) return;
    for (const item of editions) {
      if (!isPassMediumKind(item.mediumKind)) continue;
      const collectionId =
        item.collectionId?.trim() ||
        collectionIdFromTokenId(item.tokenId) ||
        '';
      if (!collectionId) continue;
      void prefetchShowPass({
        collectionId,
        tokenId: item.tokenId,
        seedTitle: item.title,
        seedCover: item.mediaUrl,
      });
    }
  }, [editions, open]);

  const followUse = (item: OwnedScarceItem) => {
    const destination = heldEditionDestination(item);
    if (destination.type === 'pass') {
      const collectionId =
        item.collectionId?.trim() ||
        collectionIdFromTokenId(item.tokenId) ||
        '';
      if (collectionId) {
        void prefetchShowPass({
          collectionId,
          tokenId: item.tokenId,
          seedTitle: item.title,
          seedCover: item.mediaUrl,
        });
      }
      setPass(item);
      return;
    }
    if (destination.type === 'article' || destination.type === 'reader') {
      const collectionId =
        item.collectionId?.trim() ||
        collectionIdFromTokenId(item.tokenId) ||
        '';
      if (!collectionId) return;
      setReaderCreatorId(item.creatorId?.trim() || null);
      setReaderSourcePostPath(item.sourcePostPath?.trim() || null);
      setReader(item);
      void fetchCollectionPreferIndexer(collectionId)
        .then((view) => {
          const nextCreator = view?.creatorId?.trim() || null;
          const nextPath = view?.sourcePostPath?.trim() || null;
          if (nextCreator) setReaderCreatorId(nextCreator);
          if (nextPath) setReaderSourcePostPath(nextPath);
        })
        .catch(() => {
          /* byline still uses edition creator / path */
        });
      return;
    }
    if (destination.type === 'play') {
      const href = destination.href.trim();
      if (!href) return;
      router.push(href);
      return;
    }
    const href = destination.href?.trim() || '';
    if (!href) return;
    if (parseInAppDropLayerHref(href)) {
      openOwnedDrop(item, href);
      return;
    }
    router.push(href);
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
        renderOwnerMenu={renderOwnerMenu}
        onChoose={(item) => {
          if (choose === 'send') {
            onTransfer?.(item);
            return;
          }
          followBrowse(item);
        }}
        onUse={choose === 'open' ? followUse : undefined}
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
          tokenId={reader.tokenId}
          accountId={accountId}
          creatorId={readerCreatorId ?? reader.creatorId}
          sourcePostPath={readerSourcePostPath ?? reader.sourcePostPath}
          readables={[]}
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
