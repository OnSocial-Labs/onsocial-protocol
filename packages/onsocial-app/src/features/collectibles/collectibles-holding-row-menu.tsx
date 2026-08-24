'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  DotsVerticalIcon,
  MultiplyIcon,
  ShopIcon,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { APP_MARKET_PATH } from '@/lib/app-routes';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface CollectiblesHoldingRowMenuProps {
  item: OwnedScarceItem;
  onList: () => void;
  onDelisted?: () => void;
}

/** Owner-only overflow — list, delist, open Market Yours. */
export function CollectiblesHoldingRowMenu({
  item,
  onList,
  onDelisted,
}: CollectiblesHoldingRowMenuProps) {
  const { getSigningWallet } = useAppWallet();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const title = item.title.trim() || 'Scarce';
  const listed = item.listingKind != null;
  const auction = item.listingKind === 'auction';
  const auctionHasBids = auction && (item.bidCount ?? 0) > 0;

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const handleDelist = useCallback(async () => {
    if (pending || !listed || auctionHasBids) return;
    close();
    setPending(true);
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const response =
        item.listingKind === 'auction'
          ? await client.scarces.auctions.cancel(item.tokenId)
          : await client.scarces.market.delist(item.tokenId);
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.cancelingScarceListing,
        successMessage: txToastSuccess.scarceListingCanceled,
        failureMessage: txToastError.cancelScarceListingFailed,
      });
      if (!confirmed) return;
      onDelisted?.();
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.cancelScarceListingFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    auctionHasBids,
    close,
    getSigningWallet,
    item.listingKind,
    item.tokenId,
    listed,
    onDelisted,
    pending,
    setTxResult,
    trackTransaction,
  ]);

  const items = useMemo<ActionDrawerItem[]>(() => {
    const list: ActionDrawerItem[] = [];

    if (!listed) {
      list.push({
        id: 'list',
        section: 'Manage',
        label: 'List for sale',
        description: 'Secondary listing on Market',
        leading: <ShopIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          close();
          onList();
        },
      });
    } else if (!auctionHasBids) {
      list.push({
        id: 'delist',
        section: 'Manage',
        label: auction ? 'Cancel auction' : 'Delist',
        description: auction
          ? 'Remove this auction listing'
          : 'Remove from Market',
        destructive: true,
        disabled: pending,
        leading: <MultiplyIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          void handleDelist();
        },
      });
    }

    list.push({
      id: 'market',
      section: 'Manage',
      label: 'Open in Market',
      description: 'Yours — sell, delist, offers',
      leading: <ShopIcon className="os-action-drawer-icon" aria-hidden />,
      href: APP_MARKET_PATH,
      onSelect: close,
    });

    return list;
  }, [
    auction,
    auctionHasBids,
    close,
    handleDelist,
    listed,
    onList,
    pending,
  ]);

  return (
    <div
      className={`drops-discovery-row-menu post-card-menu collectibles-holding-row-menu${
        open ? ' is-open' : ''
      }`}
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
        aria-label={`Manage ${title}`}
      >
        <DotsVerticalIcon className="post-card-menu-icon" aria-hidden />
      </button>

      <ActionDrawer
        open={open}
        onClose={close}
        label={title}
        copy="Your holding"
        listAriaLabel={`Manage ${title}`}
        closeAriaLabel="Close"
        items={items}
      />
    </div>
  );
}
