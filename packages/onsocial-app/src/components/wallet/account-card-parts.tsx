'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Divider,
  ExternalLinkIcon,
  LogoutIcon,
  ProtocolMotionArrow,
  PulsingDots,
} from '@onsocial/ui';
import { CircleHelp, ExternalLink, Search } from 'lucide-react';
import Link from 'next/link';
import { APP_DISCOVER_PATH } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/app-config';
import {
  APP_ACTIVITY_METRIC_LABEL,
  APP_COLLECT_ACTION_LABEL,
  APP_COLLECT_SUCCEEDED_ACTION_LABEL,
  APP_COLLECT_READY_BADGE,
  APP_SOCIAL_EMPTY_HINT,
  APP_SOCIAL_HELP_TITLE,
  APP_SOCIAL_WALLET_ARIA_LABEL,
  APP_REWARD_MIN_CLAIM_YOCTO,
} from '@/lib/app-reward-constants';
import { formatSocialCompact } from '@/lib/format-social-balance';
import {
  claimProgressPercent,
  formatClaimRatioLabel,
} from '@/lib/rewards-claim-progress';
import { AccountStorageStrip } from '@/components/wallet/account-storage-strip';
import { AppSocialHelpCard } from '@/components/wallet/app-social-help-card';
import { useAppRewardsOptional } from '@/contexts/app-rewards-context';
import { useAppSocialBalance } from '@/contexts/app-social-balance-context';
import type { PlatformStorageSummary } from '@/lib/platform-storage-display';
import { storageManageIsHighlighted } from '@/lib/user-storage-display';

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

interface AccountClaimMetricRowProps {
  showCaption?: boolean;
}

/** Compact claim bar + ratio + pill — shared by wallet zone and rewards rules sheet. */
export function AccountClaimMetricRow({
  showCaption = true,
}: AccountClaimMetricRowProps) {
  const rewards = useAppRewardsOptional();
  const claimableYocto = rewards?.claimableYocto ?? 0n;
  const canClaim = rewards?.canClaim ?? false;
  const claiming = rewards?.claiming ?? false;
  const collectSucceeded = rewards?.collectSucceeded ?? false;
  const rewardsLoading = rewards?.loading ?? false;
  const remainingToClaimYocto = rewards?.remainingToClaimYocto ?? 0n;
  const activityBarPulseKey = rewards?.activityBarPulseKey ?? 0;

  const ratioLabel = formatClaimRatioLabel(
    claimableYocto,
    APP_REWARD_MIN_CLAIM_YOCTO
  );
  const progress = claimProgressPercent(claimableYocto);
  const barFill = claimableYocto > 0n ? Math.max(progress, 3) : 0;
  const hintLine =
    !canClaim && remainingToClaimYocto > 0n
      ? `${formatSocialCompact(remainingToClaimYocto)} more to collect`
      : null;

  return (
    <>
      <div className="account-wallet-metric-row">
        {rewardsLoading ? (
          <>
            <span className="account-wallet-metric-label">
              {APP_ACTIVITY_METRIC_LABEL}
            </span>
            <span
              className="account-wallet-progress-track is-loading"
              aria-hidden
            />
            <span className="account-wallet-ratio is-loading" aria-hidden />
            <span
              className="account-wallet-metric-action is-loading"
              aria-hidden
            />
          </>
        ) : (
          <>
            <span className="account-wallet-metric-label">
              {APP_ACTIVITY_METRIC_LABEL}
            </span>
            <div
              className="account-wallet-progress-slot"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={
                canClaim
                  ? `${ratioLabel} SOCIAL ready to collect`
                  : `${ratioLabel} SOCIAL stacked`
              }
            >
              <span
                className="account-wallet-progress-track"
                data-pulse-key={activityBarPulseKey}
              >
                <span
                  className={`account-wallet-progress-fill${canClaim ? ' is-ready' : ''}`}
                  style={{ width: `${barFill}%` }}
                />
              </span>
            </div>
            <span
              className={`account-wallet-ratio${canClaim ? ' is-ready' : ''}`}
              aria-hidden
            >
              {ratioLabel}
            </span>
            {claiming ? (
              <button
                type="button"
                className="account-wallet-metric-action os-surface-chip is-ready"
                disabled
                aria-busy
              >
                <PulsingDots
                  size="sm"
                  label="Collecting SOCIAL"
                  className="account-wallet-collect-dots"
                />
              </button>
            ) : collectSucceeded ? (
              <button
                type="button"
                className="account-wallet-metric-action os-surface-chip is-succeeded"
                disabled
                aria-label={APP_COLLECT_SUCCEEDED_ACTION_LABEL}
              >
                {APP_COLLECT_SUCCEEDED_ACTION_LABEL}
              </button>
            ) : (
              <button
                type="button"
                className={`account-wallet-metric-action os-surface-chip${
                  canClaim ? ' is-ready' : ''
                }`}
                disabled={!canClaim}
                onClick={() => void rewards?.claimRewards()}
              >
                {APP_COLLECT_ACTION_LABEL}
              </button>
            )}
          </>
        )}
      </div>

      {showCaption ? (
        <p
          className={`account-wallet-caption${hintLine ? '' : ' is-empty'}`}
          aria-hidden={hintLine ? undefined : true}
        >
          {hintLine ?? '\u00a0'}
        </p>
      ) : null}
    </>
  );
}

interface AccountWalletZoneProps {
  accountId: string;
  enabled: boolean;
  onOpenStorage?: () => void;
  platformStorageLoading?: boolean;
  platformStorageError?: string | null;
  platformStorageSummary?: PlatformStorageSummary | null;
}

/** Inset wallet panel — balance hero + compact claim/storage metric bars. */
export function AccountWalletZone({
  accountId: _accountId,
  enabled,
  onOpenStorage,
  platformStorageLoading = false,
  platformStorageError = null,
  platformStorageSummary = null,
}: AccountWalletZoneProps) {
  const [socialHelpOpen, setSocialHelpOpen] = useState(false);
  const closeSocialHelp = useCallback(() => {
    setSocialHelpOpen(false);
  }, []);
  const rewards = useAppRewardsOptional();
  const refreshRewards = rewards?.refreshRewards;
  const {
    balanceYocto,
    hasLoadedBalance,
    loading: balanceLoading,
    error: balanceError,
  } = useAppSocialBalance();
  const storageHighlighted = storageManageIsHighlighted(platformStorageSummary);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refreshRewards?.({ silent: true, fresh: true });
  }, [enabled, refreshRewards]);

  useEffect(() => {
    if (!enabled) {
      setSocialHelpOpen(false);
    }
  }, [enabled]);

  const walletLabel = balanceError
    ? '—'
    : hasLoadedBalance
      ? formatSocialCompact(balanceYocto)
      : '…';

  const showWalletLoading = balanceLoading && !hasLoadedBalance;
  const claimableYocto = rewards?.claimableYocto ?? 0n;
  const canClaim = rewards?.canClaim ?? false;
  const rewardsLoading = rewards?.loading ?? false;

  const showEmptyHint =
    !rewardsLoading &&
    !balanceLoading &&
    hasLoadedBalance &&
    claimableYocto === 0n &&
    balanceYocto === 0n &&
    !balanceError;

  const hintLine = balanceError
    ? balanceError
    : showEmptyHint
      ? APP_SOCIAL_EMPTY_HINT
      : null;

  return (
    <section
      id="account-sheet-wallet-zone"
      className={`account-card-wallet-zone os-surface-panel${socialHelpOpen ? ' is-social-help-open' : ''}`}
      aria-label={APP_SOCIAL_WALLET_ARIA_LABEL}
    >
      <div className="account-wallet-balance-row">
        <div className="account-card-balance-copy" aria-live="polite">
          <span className="account-card-balance-kicker">Wallet</span>
          <span className="account-card-balance-line">
            <span
              className={`account-card-balance-value${showWalletLoading ? ' is-loading' : ''}`}
              aria-hidden={showWalletLoading}
            >
              {showWalletLoading ? '0' : walletLabel}
            </span>
            <span className="account-card-balance-unit">SOCIAL</span>
          </span>
        </div>

        <div className="account-wallet-balance-accessories">
          <button
            type="button"
            className={`account-wallet-accessory${socialHelpOpen ? ' is-active' : ''}`}
            onClick={() => setSocialHelpOpen((open) => !open)}
            aria-label={APP_SOCIAL_HELP_TITLE}
            aria-expanded={socialHelpOpen}
            aria-controls="account-social-help-dialog"
          >
            <CircleHelp
              aria-hidden
              className="account-wallet-accessory-icon"
            />
          </button>
          {canClaim ? (
            <span className="account-wallet-earning-ready">
              {APP_COLLECT_READY_BADGE}
            </span>
          ) : null}
        </div>
      </div>

      <AccountClaimMetricRow showCaption={!hintLine} />

      {hintLine ? <p className="account-wallet-caption">{hintLine}</p> : null}

      {onOpenStorage ? (
        <>
          <Divider variant="detail" className="account-wallet-zone-divider" />
          <AccountStorageStrip
            loading={platformStorageLoading}
            error={platformStorageError}
            summary={platformStorageSummary}
            manageHighlighted={storageHighlighted}
            onOpenManage={onOpenStorage}
          />
        </>
      ) : null}

      <AppSocialHelpCard open={socialHelpOpen} onClose={closeSocialHelp} />
    </section>
  );
}

interface AccountActionRowProps {
  label: string;
  hint?: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  showArrow?: boolean;
}

function AccountActionRow({
  label,
  hint,
  href,
  external,
  onClick,
  showArrow = true,
}: AccountActionRowProps) {
  const rowClass = [
    'os-surface-row',
    showArrow ? 'os-surface-row--navigate' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className="os-surface-row-copy">
        <span className="os-surface-row-label">{label}</span>
        {hint ? (
          <span className="os-surface-row-description">{hint}</span>
        ) : null}
      </span>
      {showArrow ? (
        <ProtocolMotionArrow className="account-card-action-arrow" />
      ) : (
        <ExternalLinkIcon
          className="account-card-action-external"
          aria-hidden
        />
      )}
    </>
  );

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

interface AccountShortcutDockProps {
  accountId: string;
  onClose: () => void;
  onDisconnect: () => void;
}

/** Tertiary shortcuts — discover, explorer, log out (storage lives on wallet row). */
export function AccountShortcutDock({
  accountId,
  onClose,
  onDisconnect,
}: AccountShortcutDockProps) {
  const explorerHref = `${ACTIVE_NEAR_EXPLORER_URL}/address/${accountId}`;

  return (
    <nav className="account-shortcut-dock" aria-label="Account shortcuts">
      <Link
        className="os-surface-tile account-shortcut-dock-button"
        href={APP_DISCOVER_PATH}
        onClick={onClose}
        aria-label="Discover profiles"
      >
        <Search
          aria-hidden
          className="account-shortcut-dock-icon"
          strokeWidth={1.75}
        />
      </Link>
      <a
        className="os-surface-tile account-shortcut-dock-button"
        href={explorerHref}
        target="_blank"
        rel="noreferrer"
        onClick={onClose}
        aria-label="View on explorer"
      >
        <ExternalLink
          aria-hidden
          className="account-shortcut-dock-icon"
          strokeWidth={1.75}
        />
      </a>
      <button
        type="button"
        className="os-surface-tile account-shortcut-dock-button is-danger"
        onClick={onDisconnect}
        aria-label="Log out"
      >
        <LogoutIcon aria-hidden className="account-shortcut-dock-icon" />
      </button>
    </nav>
  );
}

interface AccountActionListProps {
  accountId: string;
  isOwnerOnPage: boolean;
  onClose: () => void;
  onEditProfile: () => void;
  onCustomize?: () => void;
}

/** Primary account actions — compact list rows (tertiary links live in AccountShortcutDock). */
export function AccountActionList({
  accountId,
  isOwnerOnPage,
  onClose,
  onEditProfile,
  onCustomize,
}: AccountActionListProps) {
  const showCustomize = isOwnerOnPage && Boolean(onCustomize);

  const rows: AccountActionRowProps[] = [
    {
      label: 'Edit profile',
      hint: 'Name, bio, tags, links',
      onClick: onEditProfile,
    },
    ...(showCustomize
      ? [
          {
            label: 'Customize page',
            hint: 'Mood, layout, media',
            onClick: onCustomize,
          },
        ]
      : []),
    ...(!isOwnerOnPage
      ? [
          {
            label: 'Go to my page',
            href: portfolioPath(accountId),
            onClick: onClose,
          },
        ]
      : []),
  ];

  return (
    <nav
      className="os-surface-row-list account-action-list"
      aria-label="Account actions"
    >
      {rows.map((row) => (
        <AccountActionRow key={row.label} {...row} />
      ))}
    </nav>
  );
}
