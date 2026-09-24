'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AmountField,
  ArrowUpRightIcon,
  DotsVerticalIcon,
  EditIcon,
  FireIcon,
  GiftIcon,
  OsActionDrawerConfirm,
  OsSheetAction,
  OsSheetActions,
  ShopIcon,
  TrashIcon,
  osActionDrawerConfirmBodyClassName,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  collectionIdFromTokenId,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { fetchCollection } from '@/features/scarces/collections-data';
import {
  scarcePriceChangeHint,
  scarcePriceChangeReady,
} from '@/features/scarces/scarce-price';
import {
  ownedScarceCanBurn,
  ownedScarceCanTransfer,
} from '@/features/scarces/scarce-transfer';
import { scarcesContractIdForNetwork } from '@/features/scarces/drop-compose-draft';
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
  onTransfer?: () => void;
  onDelisted?: () => void;
  /** Text Manage control. Vault rows keep the dots trigger. */
  trigger?: 'icon' | 'label';
}

/** Owner-only overflow — list, delist, open Market Yours. */
export function CollectiblesHoldingRowMenu({
  item,
  onList,
  onTransfer,
  onDelisted,
  trigger = 'icon',
}: CollectiblesHoldingRowMenuProps) {
  const { getSigningWallet } = useAppWallet();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<'burn' | 'delist' | 'price' | null>(
    null
  );
  const [priceInput, setPriceInput] = useState('');
  const [priceDirty, setPriceDirty] = useState(false);
  const [burnable, setBurnable] = useState<boolean | null>(
    typeof item.burnable === 'boolean' ? item.burnable : null
  );

  const title = item.title.trim() || 'Scarce';
  const listed = item.listingKind != null;
  const auction = item.listingKind === 'auction';
  const auctionHasBids = auction && (item.bidCount ?? 0) > 0;
  const fixedListing = item.listingKind === 'fixed';
  const priceReady = scarcePriceChangeReady({
    listingKind: item.listingKind,
    currentPriceNear: item.listedPriceNear,
    nextPriceNear: priceInput,
  });
  const priceHint = scarcePriceChangeHint({
    currentPriceNear: item.listedPriceNear,
    nextPriceNear: priceInput,
    revealUnchanged: priceDirty,
  });

  const close = useCallback(() => {
    setConfirm(null);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (typeof item.burnable === 'boolean') {
      setBurnable(item.burnable);
      return;
    }
    if (!open) return;
    const collectionId =
      item.collectionId?.trim() ||
      collectionIdFromTokenId(item.tokenId) ||
      '';
    if (!collectionId) {
      setBurnable(false);
      return;
    }
    let cancelled = false;
    void fetchCollection(collectionId).then((view) => {
      if (!cancelled) setBurnable(view?.burnable === true);
    });
    return () => {
      cancelled = true;
    };
  }, [item.burnable, item.collectionId, item.tokenId, open]);

  const handleDelist = useCallback(async () => {
    if (pending || !listed || auctionHasBids) return;
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
      close();
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

  const openPriceConfirm = useCallback(() => {
    const current = item.listedPriceNear?.trim() ?? '';
    setPriceInput(current === '—' ? '' : current);
    setPriceDirty(false);
    setConfirm('price');
  }, [item.listedPriceNear]);

  const handleChangePrice = useCallback(async () => {
    if (pending || !priceReady) return;
    const nextPrice = finalizeAmountInput(priceInput, 5);
    if (!nextPrice) return;
    setPending(true);
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const response = await client.scarces.market.updateSalePrice(
        scarcesContractIdForNetwork(),
        item.tokenId,
        nextPrice
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.changingScarcePrice,
        successMessage: txToastSuccess.scarcePriceChanged,
        failureMessage: txToastError.changeScarcePriceFailed,
      });
      if (!confirmed) return;
      close();
      onDelisted?.();
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.changeScarcePriceFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    close,
    getSigningWallet,
    item.tokenId,
    onDelisted,
    pending,
    priceInput,
    priceReady,
    setTxResult,
    trackTransaction,
  ]);

  const handleBurn = useCallback(async () => {
    if (pending || !ownedScarceCanBurn({ ...item, burnable: burnable === true })) {
      return;
    }
    setPending(true);
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const collectionId =
        item.collectionId?.trim() ||
        collectionIdFromTokenId(item.tokenId) ||
        undefined;
      const response = await client.scarces.tokens.burn(
        item.tokenId,
        collectionId
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.burningScarce,
        successMessage: txToastSuccess.scarceBurned,
        failureMessage: txToastError.burnScarceFailed,
      });
      if (!confirmed) return;
      close();
      onDelisted?.();
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error ? cause.message : txToastError.burnScarceFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    burnable,
    close,
    getSigningWallet,
    item,
    onDelisted,
    pending,
    setTxResult,
    trackTransaction,
  ]);

  const canBurn = ownedScarceCanBurn({
    ...item,
    burnable: burnable === true,
  });

  const items = useMemo<ActionDrawerItem[]>(() => {
    const list: ActionDrawerItem[] = [];

    if (onTransfer && ownedScarceCanTransfer(item)) {
      list.push({
        id: 'transfer',
        section: 'Manage',
        label: 'Transfer',
        description: listed
          ? 'Send it on. This comes off sale.'
          : 'Send this scarce to another account',
        leading: <GiftIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => {
          close();
          onTransfer();
        },
      });
    }

    if (fixedListing) {
      list.push({
        id: 'price',
        section: 'Manage',
        label: 'Change price',
        description: 'New asking price, same listing',
        leading: <EditIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: openPriceConfirm,
      });
    }

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
        leading: <TrashIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => setConfirm('delist'),
      });
    }

    if (canBurn) {
      list.push({
        id: 'burn',
        section: 'Manage',
        label: 'Burn',
        description: listed
          ? 'Permanent. This comes off sale.'
          : 'Permanent. The scarce is gone.',
        destructive: true,
        disabled: pending,
        leading: <FireIcon className="os-action-drawer-icon" aria-hidden />,
        onSelect: () => setConfirm('burn'),
      });
    }

    list.push({
      id: 'market',
      section: 'Manage',
      label: 'Open in Market',
      description: 'Yours — sell, delist, offers',
      leading: <ArrowUpRightIcon className="os-action-drawer-icon" aria-hidden />,
      href: APP_MARKET_PATH,
      onSelect: close,
    });

    return list;
  }, [
    auction,
    auctionHasBids,
    fixedListing,
    openPriceConfirm,
    canBurn,
    close,
    item,
    listed,
    onList,
    onTransfer,
    pending,
  ]);

  return (
    <div
      className={`drops-discovery-row-menu post-card-menu collectibles-holding-row-menu${
        open ? ' is-open' : ''
      }`}
    >
      {trigger === 'label' ? (
        <OsSheetActions
          layout="row-compact"
          tone="frosted-primary"
          size="sm"
          borderless
          className="market-listing-action"
        >
          <OsSheetAction
            type="button"
            variant="ghost"
            ready
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            Manage
          </OsSheetAction>
        </OsSheetActions>
      ) : (
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
      )}

      <ActionDrawer
        open={open}
        onClose={confirm ? () => setConfirm(null) : close}
        label={
          confirm === 'burn'
            ? 'Burn'
            : confirm === 'delist'
              ? auction
                ? 'Cancel auction'
                : 'Delist'
              : confirm === 'price'
                ? 'Change price'
                : title
        }
        copy={confirm ? title : 'Your holding'}
        listAriaLabel={`Manage ${title}`}
        closeAriaLabel={confirm ? 'Back' : 'Close'}
        items={confirm ? undefined : items}
      >
        {confirm === 'burn' ? (
          <OsActionDrawerConfirm
            variant="danger"
            body={
              listed
                ? 'This comes off sale. This cannot be undone.'
                : 'This cannot be undone.'
            }
            confirmLabel="Burn"
            pending={pending}
            pendingLabel="Burning…"
            onConfirm={() => void handleBurn()}
            onCancel={() => setConfirm(null)}
          />
        ) : confirm === 'delist' ? (
          <OsActionDrawerConfirm
            variant="danger"
            body={
              auction
                ? 'This auction comes off Market.'
                : 'This listing comes off Market.'
            }
            confirmLabel={auction ? 'Cancel auction' : 'Delist'}
            pending={pending}
            pendingLabel={auction ? 'Canceling…' : 'Delisting…'}
            onConfirm={() => void handleDelist()}
            onCancel={() => setConfirm(null)}
          />
        ) : confirm === 'price' ? (
          <OsActionDrawerConfirm
            body="This price replaces the current listing."
            confirmLabel="Change price"
            confirmDisabled={!priceReady}
            pending={pending}
            pendingLabel="Changing…"
            onConfirm={() => void handleChangePrice()}
            onCancel={() => setConfirm(null)}
          >
            <AmountField
              value={priceInput}
              onValueChange={(raw) => {
                setPriceDirty(true);
                setPriceInput(normalizeAmountInput(raw, 5));
              }}
              maxDecimals={5}
              placeholder="0.01"
              aria-label="Price in NEAR"
              unit="NEAR"
              disabled={pending}
              invalid={Boolean(priceHint)}
            />
            {priceHint ? (
              <p className={osActionDrawerConfirmBodyClassName}>{priceHint}</p>
            ) : null}
          </OsActionDrawerConfirm>
        ) : undefined}
      </ActionDrawer>
    </div>
  );
}
