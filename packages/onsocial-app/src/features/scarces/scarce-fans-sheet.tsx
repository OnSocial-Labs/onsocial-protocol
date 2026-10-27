'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon, Divider, OsHugSheet } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { osChromePageClassName } from '@/lib/os-chrome-page';
import {
  ProfileSocialListRow,
  ProfileSocialListSkeleton,
} from '@/components/panels/profile-social-list-row';
import { useFeedWindow } from '@/features/home/use-feed-window';
import { STANDING_ANCHOR_QUERY } from '@/features/home/home-feed-scroll-anchor';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { accountIdsEqual } from '@/lib/account-match';
import { loadProfileListAccounts } from '@/lib/load-profile-list-accounts';
import {
  filterGuestRoster,
  guestRosterMatchLine,
  profileListAccountToStandingSummary,
  type ProfileListAccount,
} from '@/lib/profile-list-account';
import { SHEET_Z } from '@/lib/sheet-z';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export type ScarceFansSheetProps = {
  open: boolean;
  onClose: () => void;
  fanIds: string[];
  fanCount: number;
  dropTitle?: string | null;
  /** Quiet totals above the roster. */
  lede?: string | null;
  /** Hug card for fans. Page for a guest list that has to clear the dock. */
  frame?: 'hug' | 'page';
  /** True while account ids are still loading (e.g. post likes fetch). */
  idsLoading?: boolean;
  /** The id list itself failed, before profile rows load. */
  idsError?: boolean;
  label?: string;
  countSingular?: string;
  countPlural?: string;
  emptyCopy?: string;
  errorCopy?: string;
  closeAriaLabel?: string;
  backdropLabel?: string;
  /** Page roster search. Hug fans sheets leave these unused. */
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  searchClearAriaLabel?: string;
  zIndex?: number;
  onClosed?: () => void;
};

/**
 * Gesture roster — face, name, @id, and stand.
 * Album fans and post likes share this sheet. Standings keep the ledger row.
 */
export function ScarceFansSheet({
  open,
  onClose,
  fanIds,
  fanCount,
  dropTitle,
  lede = null,
  frame = 'hug',
  idsLoading = false,
  idsError = false,
  label = 'Fans',
  countSingular = 'fan',
  countPlural = 'fans',
  emptyCopy = 'No fans yet.',
  errorCopy = 'Couldn’t load fans.',
  closeAriaLabel = 'Close fans',
  backdropLabel = 'Close fans',
  searchPlaceholder = 'Search',
  searchAriaLabel = 'Search by name',
  searchClearAriaLabel = 'Clear search',
  zIndex = SHEET_Z.list,
  onClosed,
}: ScarceFansSheetProps) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding('scarce-fans');
  const [query, setQuery] = useState('');

  const fanIdsKey = fanIds.join('\n');
  const requestKey = open ? `${fanIdsKey}\0${viewerAccountId ?? ''}` : '';
  const [fetched, setFetched] = useState<{
    key: string;
    accounts: ProfileListAccount[];
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open || idsLoading || fanIds.length === 0) return;
    const key = requestKey;
    let cancelled = false;

    void loadProfileListAccounts(fanIds, viewerAccountId ?? null)
      .then((accounts) => {
        if (cancelled) return;
        setFetched({ key, accounts, error: false });
      })
      .catch(() => {
        if (cancelled) return;
        setFetched({ key, accounts: [], error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [open, requestKey, fanIds, viewerAccountId, idsLoading]);

  const handleClose = useCallback(() => {
    setFetched(null);
    setQuery('');
    onClose();
  }, [onClose]);

  const handleUpdateStanding = useCallback(
    async (account: ProfileListAccount, shouldStand: boolean) => {
      try {
        await updateStanding(
          profileListAccountToStandingSummary(account),
          shouldStand
        );
        setFetched((current) =>
          current
            ? {
                ...current,
                accounts: current.accounts.map((row) =>
                  accountIdsEqual(row.accountId, account.accountId)
                    ? { ...row, viewerStanding: shouldStand }
                    : row
                ),
              }
            : current
        );
      } catch (cause) {
        if (!isWalletUserCancellation(cause)) {
          setTxResult({
            type: 'error',
            msg:
              cause instanceof Error
                ? cause.message
                : 'Couldn’t update standing.',
          });
        }
      }
    },
    [setTxResult, updateStanding]
  );

  const countLabel = useMemo(() => {
    const n = Math.max(fanCount, fanIds.length);
    return n === 1 ? `1 ${countSingular}` : `${n} ${countPlural}`;
  }, [countPlural, countSingular, fanCount, fanIds.length]);

  const accounts = useMemo(() => {
    if (!open || idsLoading || fanIds.length === 0) return [];
    if (fetched?.key !== requestKey) return null;
    return fetched.accounts;
  }, [fanIds.length, fetched, idsLoading, open, requestKey]);
  const visible = useMemo(() => {
    if (!accounts) return null;
    if (frame !== 'page') return accounts;
    return filterGuestRoster(accounts, query);
  }, [accounts, frame, query]);
  /*
   * List windowing — same core as the social lists (#633) and the DM inbox
   * (#644): past the row threshold, far roster rows collapse into spacers so
   * a long guest list stops paying DOM cost offscreen. Rows are the short
   * standing rows (~76px estimate); the measured cache corrects it after
   * first paint. Keys follow the search filter — the hook re-syncs on
   * mutation before paint.
   */
  const rowKeys = useMemo(
    () => (visible ?? []).map((account) => account.accountId),
    [visible]
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  const { windowed, start, end, topSpacer, bottomSpacer, registerRow } =
    useFeedWindow({
      keys: rowKeys,
      hostRef: listRef,
      anchorQuery: STANDING_ANCHOR_QUERY,
      estimate: 76,
    });
  const loadError =
    Boolean(open) &&
    !idsLoading &&
    (idsError || (fetched?.key === requestKey && fetched.error));
  const showSkeleton =
    open && (idsLoading || (fanIds.length > 0 && accounts === null));
  const skeletonCount = Math.min(
    8,
    Math.max(fanIds.length || fanCount || 1, 1)
  );
  const tally = lede?.trim() || '';
  const searching = frame === 'page' && query.trim().length > 0;
  const matchLine =
    searching && visible ? guestRosterMatchLine(visible.length) : null;
  const headLine = searching ? (matchLine ?? '') : tally;
  const list = (
    <>
      {headLine ? <p className="scarce-fans-lede">{headLine}</p> : null}
      {showSkeleton ? (
        <ProfileSocialListSkeleton count={skeletonCount} rowVariant="person" />
      ) : visible && visible.length > 0 ? (
        <div className="standing-list scarce-fans-standing" ref={listRef}>
          {windowed && topSpacer > 0 ? (
            <div
              style={{ height: topSpacer }}
              aria-hidden="true"
              data-feed-window-spacer="top"
            />
          ) : null}
          {visible.slice(start, end).map((account, sliceIndex) => {
            const index = start + sliceIndex;
            const isSelf =
              Boolean(viewerAccountId) &&
              accountIdsEqual(viewerAccountId!, account.accountId);
            return (
              <div
                key={account.accountId}
                ref={registerRow(account.accountId)}
                data-standing-key={account.accountId}
              >
                {index > 0 ? <Divider variant="item" /> : null}
                <ProfileSocialListRow
                  account={account}
                  density="person"
                  standingTimeMode="never"
                  viewerAccountId={viewerAccountId}
                  canUpdateStanding={isConnected && !isSelf}
                  isPending={isStandingPendingForTarget(account.accountId)}
                  onUpdateStanding={(shouldStand) => {
                    void handleUpdateStanding(account, shouldStand);
                  }}
                />
              </div>
            );
          })}
          {windowed && bottomSpacer > 0 ? (
            <div
              style={{ height: bottomSpacer }}
              aria-hidden="true"
              data-feed-window-spacer="bottom"
            />
          ) : null}
        </div>
      ) : (
        <p className="scarce-fans-empty">
          {loadError ? errorCopy : searching ? 'No matches.' : emptyCopy}
        </p>
      )}
    </>
  );

  if (frame === 'page') {
    return (
      <OsSlideOverScreen
        open={open}
        onClose={handleClose}
        onClosed={onClosed}
        title={dropTitle?.trim() || label}
        compactChrome
        heading={
          <OsAppChromeNavSearch
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder}
            clearAriaLabel={searchClearAriaLabel}
            ariaLabel={searchAriaLabel}
            idleClassName="discover-nav-search-field"
          />
        }
        closeAriaLabel={closeAriaLabel}
        closeIcon={
          <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
        }
        zIndex={zIndex}
        className="event-guests-slide"
        contentClassName={osChromePageClassName('event-guests')}
      >
        {list}
      </OsSlideOverScreen>
    );
  }

  return (
    <OsHugSheet
      open={open}
      onClose={handleClose}
      label={label}
      copy={dropTitle?.trim() || countLabel}
      closeAriaLabel={closeAriaLabel}
      backdropLabel={backdropLabel}
      zIndex={zIndex}
      onClosed={onClosed}
      panelClassName="scarce-fans-sheet-panel os-sheet-cap-standard"
      bodyClassName="scarce-fans-sheet-body"
    >
      {list}
    </OsHugSheet>
  );
}
