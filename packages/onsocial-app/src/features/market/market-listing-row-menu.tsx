'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  DotsVerticalIcon,
  EditPenIcon,
  ShareIcon,
  TimeIcon,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectionIdFromTokenId } from '@/features/market/market-listings';
import {
  isDropComposeDraftReady,
  requestDropCompose,
} from '@/features/scarces/drop-compose-draft';
import { ScarceTokenHistorySheet } from '@/features/scarces/scarce-token-history-sheet';
import { shareUrl } from '@/lib/share-url';

export type ListingOverflowAction = 'history' | 'share' | 'share-to-post';

/** What the listing ⋮ can offer. History only when the row is one edition. */
export function listingOverflowActions(input: {
  tokenId?: string | null;
  collectionId?: string | null;
  sharePath?: string | null;
}): ListingOverflowAction[] {
  const tokenId = input.tokenId?.trim() || '';
  const collectionId =
    input.collectionId?.trim() ||
    (tokenId ? collectionIdFromTokenId(tokenId) || '' : '');
  const actions: ListingOverflowAction[] = [];
  if (tokenId) actions.push('history');
  if (input.sharePath?.trim()) actions.push('share');
  if (isDropComposeDraftReady({ collectionId, tokenId })) {
    actions.push('share-to-post');
  }
  return actions;
}

function absoluteAppUrl(path: string): string {
  const href = path.trim();
  if (!href) return '';
  if (/^https?:\/\//.test(href)) return href;
  if (typeof window === 'undefined') return href;
  return `${window.location.origin}${href.startsWith('/') ? href : `/${href}`}`;
}

/** Fields the listing ⋮ needs. A sale row passes the same shape. */
export interface ListingOverflowSubject {
  title: string;
  tokenId?: string | null;
  collectionId?: string | null;
  mediaUrl?: string | null;
  mediumKind?: string | null;
  sourcePostPath?: string | null;
  /** Primary mint copy. Resales and sales share the title. */
  kind?: string | null;
}

/** Listing overflow beside the time — History, Share, Share to post. */
export function MarketListingRowMenu({
  item,
  sharePath,
}: {
  item: ListingOverflowSubject;
  /** Row destination (drop, or the post when there is no drop). */
  sharePath?: string | null;
}) {
  const { isConnected, connect } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const title = item.title.trim() || 'Scarce';
  const tokenId = item.tokenId?.trim() || '';
  const collectionId =
    item.collectionId?.trim() ||
    (tokenId ? collectionIdFromTokenId(tokenId) || '' : '');
  const actions = listingOverflowActions({
    tokenId,
    collectionId,
    sharePath,
  });

  const close = useCallback(() => setOpen(false), []);

  const handleShare = useCallback(async () => {
    const url = absoluteAppUrl(sharePath ?? '');
    const result = await shareUrl({
      url,
      title,
      text:
        item.kind === 'lazy'
          ? `Mint ${title} on OnSocial`
          : `${title} on OnSocial`,
    });
    close();
    if (result === 'copied') {
      setTxResult({ type: 'success', msg: 'Link copied.' });
    } else if (result === 'failed') {
      setTxResult({ type: 'error', msg: 'Couldn’t share this listing.' });
    }
  }, [close, item.kind, setTxResult, sharePath, title]);

  const handleShareToPost = useCallback(() => {
    if (!isConnected) {
      void connect();
      return;
    }
    requestDropCompose({
      ...(collectionId ? { collectionId } : {}),
      ...(tokenId ? { tokenId } : {}),
      title,
      ...(item.mediaUrl ? { mediaUrl: item.mediaUrl } : {}),
      ...(item.mediumKind ? { mediumKind: item.mediumKind } : {}),
      ...(item.sourcePostPath ? { sourcePostPath: item.sourcePostPath } : {}),
    });
    close();
  }, [
    close,
    collectionId,
    connect,
    isConnected,
    item.mediaUrl,
    item.mediumKind,
    item.sourcePostPath,
    title,
    tokenId,
  ]);

  const items = useMemo<ActionDrawerItem[]>(() => {
    const list: ActionDrawerItem[] = [];
    if (actions.includes('history')) {
      list.push({
        id: 'history',
        section: 'History',
        label: 'History',
        description: "This edition's life",
        leading: <TimeIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          setOpen(false);
          setHistoryOpen(true);
        },
      });
    }
    if (actions.includes('share')) {
      list.push({
        id: 'share',
        section: 'Listing',
        label: 'Share',
        description: 'Copy or send the link',
        leading: <ShareIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          void handleShare();
        },
      });
    }
    if (actions.includes('share-to-post')) {
      list.push({
        id: 'share-to-post',
        section: 'Listing',
        label: 'Share to post',
        description: 'Open composer with this listing',
        leading: <EditPenIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: handleShareToPost,
      });
    }
    return list;
  }, [actions, handleShare, handleShareToPost]);

  if (items.length === 0) return null;

  return (
    <div
      className={`drops-discovery-row-menu post-card-menu${open ? ' is-open' : ''}`}
    >
      <button
        type="button"
        className={`post-card-menu-trigger${open ? ' is-open' : ''}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`More for ${title}`}
      >
        <DotsVerticalIcon className="post-card-menu-icon" aria-hidden />
      </button>
      <ActionDrawer
        open={open}
        onClose={close}
        label={title}
        listAriaLabel={`Actions for ${title}`}
        closeAriaLabel="Close"
        items={items}
      />
      {tokenId ? (
        <ScarceTokenHistorySheet
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          tokenId={tokenId}
          title={title}
        />
      ) : null}
    </div>
  );
}
