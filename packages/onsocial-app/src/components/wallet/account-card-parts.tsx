'use client';

import { useEffect, type ReactNode } from 'react';
import {
  ChevronRightIcon,
  EditIcon,
  ExternalLinkIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  UserIcon,
} from '@onsocial/ui';
import Link from 'next/link';
import { APP_DISCOVER_PATH } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/app-config';
import {
  APP_REWARD_EMPTY_HINT,
  APP_REWARD_MIN_CLAIM_YOCTO,
} from '@/lib/app-reward-constants';
import { formatSocialCompact } from '@/lib/format-social-balance';
import {
  claimProgressPercent,
  formatClaimRatioLabel,
} from '@/lib/rewards-claim-progress';
import { useAppRewardsOptional } from '@/contexts/app-rewards-context';
import { useAppSocialBalance } from '@/hooks/use-app-social-balance';

interface AccountSessionChipProps {
  isBootstrapping: boolean;
  onResume: () => void;
}

export function AccountSessionChip({
  isBootstrapping,
  onResume,
}: AccountSessionChipProps) {
  return (
    <button
      type="button"
      className="account-card-session-chip"
      onClick={onResume}
      disabled={isBootstrapping}
    >
      {isBootstrapping ? 'Resuming session…' : 'Resume OnSocial session'}
    </button>
  );
}

interface AccountWalletZoneProps {
  accountId: string;
  enabled: boolean;
}

/** Inset wallet panel — balance + earning progress; the drawer’s money moment. */
export function AccountWalletZone({ accountId, enabled }: AccountWalletZoneProps) {
  const rewards = useAppRewardsOptional();
  const refreshRewards = rewards?.refreshRewards;
  const {
    balanceYocto,
    hasLoadedBalance,
    loading: balanceLoading,
    error: balanceError,
    refresh: refreshBalance,
  } = useAppSocialBalance(accountId, enabled);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refreshBalance();
    void refreshRewards?.({ silent: true });
  }, [enabled, refreshBalance, refreshRewards]);

  const walletLabel = balanceError
    ? '—'
    : hasLoadedBalance
      ? formatSocialCompact(balanceYocto)
      : '…';

  const showWalletLoading = balanceLoading && !hasLoadedBalance;
  const claimableYocto = rewards?.claimableYocto ?? 0n;
  const canClaim = rewards?.canClaim ?? false;
  const claiming = rewards?.claiming ?? false;
  const rewardsLoading = rewards?.loading ?? false;
  const remainingToClaimYocto = rewards?.remainingToClaimYocto ?? 0n;

  const showEmptyHint =
    !rewardsLoading &&
    !balanceLoading &&
    hasLoadedBalance &&
    claimableYocto === 0n &&
    balanceYocto === 0n &&
    !balanceError;

  const ratioLabel = formatClaimRatioLabel(
    claimableYocto,
    APP_REWARD_MIN_CLAIM_YOCTO
  );
  const progress = claimProgressPercent(claimableYocto);
  const barFill = claimableYocto > 0n ? Math.max(progress, 3) : 0;

  return (
    <section
      id="account-sheet-wallet-zone"
      className="account-card-wallet-zone"
      aria-label="Wallet"
    >
      <div className="account-card-wallet-zone-head">
        <span className="account-card-wallet-label">Balance</span>
      </div>

      <div className="account-card-balance-row">
        <div className="account-card-balance-copy" aria-live="polite">
          {showWalletLoading ? (
            <span className="account-card-balance-skeleton" aria-hidden />
          ) : (
            <>
              <span className="account-card-balance-value">{walletLabel}</span>
              <span className="account-card-balance-unit">SOCIAL</span>
            </>
          )}
        </div>
      </div>

      <div className="account-card-earning-head">
        <span className="account-card-wallet-label">Earning</span>
        {canClaim ? (
          <span className="account-card-earning-ready">Ready to claim</span>
        ) : null}
      </div>

      <div className="account-card-claim-row">
        {rewardsLoading ? (
          <>
            <span className="account-card-progress-track is-loading" aria-hidden />
            <span className="account-card-ratio is-loading" aria-hidden />
          </>
        ) : (
          <>
            <div
              className="account-card-progress-track"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={
                canClaim
                  ? `${ratioLabel} SOCIAL ready to claim`
                  : `${ratioLabel} SOCIAL claimable`
              }
            >
              <span
                className={`account-card-progress-fill${canClaim ? ' is-ready' : ''}`}
                style={{ width: `${barFill}%` }}
              />
            </div>
            <span
              className={`account-card-ratio${canClaim ? ' is-ready' : ''}`}
              aria-hidden
            >
              {ratioLabel}
            </span>
          </>
        )}

        <button
          type="button"
          className={`account-card-claim${canClaim ? ' is-ready' : ''}`}
          disabled={!canClaim || claiming || rewardsLoading}
          aria-busy={claiming || undefined}
          onClick={() => void rewards?.claimRewards()}
        >
          {claiming ? '…' : 'Claim'}
        </button>
      </div>

      {showEmptyHint ? (
        <p className="account-card-hint">{APP_REWARD_EMPTY_HINT}</p>
      ) : null}
      {!showEmptyHint && !canClaim && remainingToClaimYocto > 0n ? (
        <p className="account-card-hint">
          {formatSocialCompact(remainingToClaimYocto)} more to minimum
        </p>
      ) : null}
    </section>
  );
}

interface AccountActionRowProps {
  icon: ReactNode;
  label: string;
  hint?: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  className?: string;
}

function AccountActionRow({
  icon,
  label,
  hint,
  href,
  external,
  onClick,
  className,
}: AccountActionRowProps) {
  const content = (
    <>
      <span className="account-card-action-icon" aria-hidden>
        {icon}
      </span>
      <span className="account-card-action-copy">
        <span className="account-card-action-label">{label}</span>
        {hint ? (
          <span className="account-card-action-hint">{hint}</span>
        ) : null}
      </span>
      <ChevronRightIcon aria-hidden className="account-card-action-chevron" />
    </>
  );

  const rowClass = ['account-card-action', className].filter(Boolean).join(' ');

  if (href) {
    return external ? (
      <a
        className={rowClass}
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={onClick}
      >
        {content}
      </a>
    ) : (
      <Link className={rowClass} href={href} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={rowClass} onClick={onClick}>
      {content}
    </button>
  );
}

interface AccountActionListProps {
  accountId: string;
  isOwnerOnPage: boolean;
  onClose: () => void;
  onEditProfile: () => void;
  onCustomize?: () => void;
}

/** Labeled OS rows — readable in a wide glass drawer (not Portal’s icon dock). */
export function AccountActionList({
  accountId,
  isOwnerOnPage,
  onClose,
  onEditProfile,
  onCustomize,
}: AccountActionListProps) {
  const showCustomize = isOwnerOnPage && Boolean(onCustomize);

  return (
    <nav className="account-card-actions" aria-label="Account actions">
      <AccountActionRow
        icon={<EditIcon className="account-card-action-glyph" />}
        label="Edit profile"
        hint="Name, bio, tags, links"
        onClick={onEditProfile}
      />

      {showCustomize ? (
        <AccountActionRow
          icon={<SlidersHorizontalIcon className="account-card-action-glyph" />}
          label="Customize page"
          hint="Mood, layout, media"
          onClick={onCustomize}
        />
      ) : null}

      {!isOwnerOnPage ? (
        <AccountActionRow
          icon={<UserIcon className="account-card-action-glyph" />}
          label="Go to my page"
          href={portfolioPath(accountId)}
          onClick={onClose}
        />
      ) : null}

      <AccountActionRow
        icon={<SearchIcon className="account-card-action-glyph" />}
        label="Discover"
        href={APP_DISCOVER_PATH}
        onClick={onClose}
      />

      <AccountActionRow
        icon={<ExternalLinkIcon className="account-card-action-glyph" />}
        label="View on Nearblocks"
        href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${accountId}`}
        external
        onClick={onClose}
      />
    </nav>
  );
}
