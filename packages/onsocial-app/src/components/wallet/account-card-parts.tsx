'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ExternalLinkIcon,
  LogoutIcon,
  PulsingDots,
  QuestionMarkCircleIcon,
  RepeatIcon,
  SearchIcon,
} from '@onsocial/ui';
import Link from 'next/link';
import { APP_DISCOVER_PATH } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/app-config';
import {
  APP_ACTIVITY_METRIC_LABEL,
  APP_COLLECT_ACTION_LABEL,
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
import { usePwa } from '@/components/providers/pwa-provider';
import { useWebPush } from '@/components/providers/web-push-provider';
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

/** Half-drawer claim cell — label · ratio · bar · Collect. */
export function AccountClaimMetricRow({
  showCaption = true,
}: AccountClaimMetricRowProps) {
  const rewards = useAppRewardsOptional();
  const claimableYocto = rewards?.claimableYocto ?? 0n;
  const canClaim = rewards?.canClaim ?? false;
  const claiming = rewards?.claiming ?? false;
  const rewardsLoading = rewards?.loading ?? false;
  const remainingToClaimYocto = rewards?.remainingToClaimYocto ?? 0n;
  const activityBarPulseKey = rewards?.activityBarPulseKey ?? 0;
  const sheetCreditHint = rewards?.sheetCreditHint ?? null;

  const ratioLabel = formatClaimRatioLabel(
    claimableYocto,
    APP_REWARD_MIN_CLAIM_YOCTO
  );
  const progress = claimProgressPercent(claimableYocto);
  const barFill = claimableYocto > 0n ? Math.max(progress, 3) : 0;
  const hintLine = sheetCreditHint
    ? sheetCreditHint
    : !canClaim && remainingToClaimYocto > 0n
      ? `${formatSocialCompact(remainingToClaimYocto)} more to collect`
      : null;
  const hintIsCredit = Boolean(sheetCreditHint);

  return (
    <div className="account-wallet-metric-cell">
      {rewardsLoading ? (
        <>
          <div className="account-wallet-metric-cell-head">
            <span className="account-wallet-metric-label">
              {APP_ACTIVITY_METRIC_LABEL}
            </span>
            <span className="account-wallet-ratio is-loading" aria-hidden />
          </div>
          <div className="account-wallet-metric-cell-track">
            <span
              className="account-wallet-progress-track is-loading"
              aria-hidden
            />
            <span
              className="account-wallet-metric-action is-loading"
              aria-hidden
            />
          </div>
        </>
      ) : (
        <>
          <div className="account-wallet-metric-cell-head">
            <span className="account-wallet-metric-label">
              {APP_ACTIVITY_METRIC_LABEL}
            </span>
            <span
              className={`account-wallet-ratio${canClaim ? ' is-ready' : ''}`}
              aria-hidden
            >
              {ratioLabel}
            </span>
          </div>
          <div className="account-wallet-metric-cell-track">
            <div
              className="account-wallet-progress-slot"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={
                canClaim
                  ? `${ratioLabel} SOCIAL ready to collect`
                  : hintLine
                    ? `${ratioLabel} SOCIAL stacked. ${hintLine}`
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
          </div>
        </>
      )}

      {showCaption && hintLine ? (
        <p
          className={`account-wallet-caption${hintIsCredit ? ' is-credit' : ''}`}
          aria-live={hintIsCredit ? 'polite' : undefined}
        >
          {hintLine}
        </p>
      ) : null}
    </div>
  );
}

interface AccountWalletZoneProps {
  enabled: boolean;
  onOpenStorage?: () => void;
  onOpenSwap?: () => void;
  platformStorageLoading?: boolean;
  platformStorageError?: string | null;
  platformStorageSummary?: PlatformStorageSummary | null;
}

/** Inset wallet panel — balance hero + compact claim/storage metric bars. */
export function AccountWalletZone({
  enabled,
  onOpenStorage,
  onOpenSwap,
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
      className="account-card-wallet-zone os-surface-panel"
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
          {canClaim ? (
            <span className="account-wallet-earning-ready">
              {APP_COLLECT_READY_BADGE}
            </span>
          ) : null}
          {onOpenSwap ? (
            <button
              type="button"
              className="account-wallet-get-social os-surface-chip"
              onClick={onOpenSwap}
              aria-label="Get SOCIAL"
            >
              Get
            </button>
          ) : null}
          <button
            type="button"
            className={`account-wallet-accessory${socialHelpOpen ? ' is-active' : ''}`}
            onClick={() => setSocialHelpOpen((open) => !open)}
            aria-label={APP_SOCIAL_HELP_TITLE}
            aria-expanded={socialHelpOpen}
            aria-haspopup="dialog"
          >
            <QuestionMarkCircleIcon
              aria-hidden
              className="account-wallet-accessory-icon"
            />
          </button>
        </div>
      </div>

      <div className="account-wallet-metrics">
        <AccountClaimMetricRow showCaption={!hintLine} />

        {onOpenStorage ? (
          <AccountStorageStrip
            loading={platformStorageLoading}
            error={platformStorageError}
            summary={platformStorageSummary}
            manageHighlighted={storageHighlighted}
            onOpenManage={onOpenStorage}
          />
        ) : null}
      </div>

      {hintLine ? <p className="account-wallet-caption">{hintLine}</p> : null}

      <AppSocialHelpCard open={socialHelpOpen} onClose={closeSocialHelp} />
    </section>
  );
}

interface AccountActionChipProps {
  label: string;
  hint?: string;
  href?: string;
  onClick?: () => void;
}

function AccountActionChip({ label, hint, href, onClick }: AccountActionChipProps) {
  const className = 'account-action-chip';
  const body = (
    <>
      <span className="account-action-chip-label">{label}</span>
      {hint ? (
        <span className="account-action-chip-hint">{hint}</span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={className}
        aria-label={hint ? `${label}. ${hint}` : label}
        onClick={onClick}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={hint ? `${label}. ${hint}` : label}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

interface AccountShortcutDockProps {
  accountId: string;
  onClose: () => void;
  onSwitchWallet: () => void;
  onDisconnect: () => void;
}

/** Tertiary shortcuts — discover, explorer, switch wallet, log out. */
export function AccountShortcutDock({
  accountId,
  onClose,
  onSwitchWallet,
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
        <SearchIcon aria-hidden className="account-shortcut-dock-icon" />
      </Link>
      <a
        className="os-surface-tile account-shortcut-dock-button"
        href={explorerHref}
        target="_blank"
        rel="noreferrer"
        onClick={onClose}
        aria-label="View on explorer"
      >
        <ExternalLinkIcon aria-hidden className="account-shortcut-dock-icon" />
      </a>
      <button
        type="button"
        className="os-surface-tile account-shortcut-dock-button"
        onClick={onSwitchWallet}
        aria-label="Switch wallet"
      >
        <RepeatIcon aria-hidden className="account-shortcut-dock-icon" />
      </button>
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
  onMutedBlocked?: () => void;
  onOpenTokens?: () => void;
  safeMode?: boolean;
  onToggleSafeMode?: () => void;
}

/** Half-drawer actions — chip grid + slim toggles (dock stays separate). */
export function AccountActionList({
  accountId,
  isOwnerOnPage,
  onClose,
  onEditProfile,
  onCustomize,
  onMutedBlocked,
  onOpenTokens,
  safeMode,
  onToggleSafeMode,
}: AccountActionListProps) {
  const showCustomize = isOwnerOnPage && Boolean(onCustomize);
  const { canInstall, isInstalled, install } = usePwa();
  const {
    supported: pushSupported,
    configured: pushConfigured,
    enabled: pushEnabled,
    busy: pushBusy,
    permission: pushPermission,
    enable: enablePush,
    disable: disablePush,
  } = useWebPush();

  const showPushToggle =
    pushSupported && pushConfigured && pushPermission !== 'denied';

  const chips: AccountActionChipProps[] = [
    {
      label: 'Edit profile',
      hint: 'Name, photo, location, bio, links',
      onClick: onEditProfile,
    },
    ...(onOpenTokens
      ? [
          {
            label: 'Creator tokens',
            hint: 'Name, symbol, supply',
            onClick: onOpenTokens,
          },
        ]
      : []),
    ...(showCustomize
      ? [
          {
            label: 'Customize page',
            hint: 'Mood, layout, media',
            onClick: onCustomize,
          },
        ]
      : []),
    ...(onMutedBlocked
      ? [
          {
            label: 'Muted & blocked',
            hint: 'Hide accounts from your feeds',
            onClick: onMutedBlocked,
          },
        ]
      : []),
    ...(!isOwnerOnPage
      ? [
          {
            label: 'Go to my page',
            hint: 'Open your portfolio',
            href: portfolioPath(accountId),
            onClick: onClose,
          },
        ]
      : []),
    ...(!isInstalled && canInstall
      ? [
          {
            label: 'Install app',
            hint: 'Add OnSocial to your home screen',
            onClick: () => {
              void install().then((accepted) => {
                if (accepted) onClose();
              });
            },
          },
        ]
      : []),
  ];

  return (
    <div className="account-action-stack">
      <nav className="account-action-grid" aria-label="Account actions">
        {chips.map((chip) => (
          <AccountActionChip key={chip.label} {...chip} />
        ))}
      </nav>

      {showPushToggle || (onToggleSafeMode != null && safeMode != null) ? (
        <div className="account-action-toggles">
          {showPushToggle ? (
            <button
              type="button"
              className="account-action-toggle"
              role="switch"
              aria-checked={pushEnabled}
              disabled={pushBusy}
              onClick={() => {
                if (pushEnabled) {
                  void disablePush();
                } else {
                  void enablePush();
                }
              }}
            >
              <span className="account-action-toggle-copy">
                <span className="account-action-toggle-label">Push alerts</span>
                <span className="account-action-toggle-hint">
                  {pushBusy
                    ? 'Updating…'
                    : pushEnabled
                      ? 'Activity alerts on this device'
                      : 'Get Activity alerts on this device'}
                </span>
              </span>
              <span
                className={`account-safe-mode-switch${pushEnabled ? ' is-on' : ''}`}
                aria-hidden
              />
            </button>
          ) : null}
          {onToggleSafeMode != null && safeMode != null ? (
            <button
              type="button"
              className="account-action-toggle"
              role="switch"
              aria-checked={safeMode}
              onClick={onToggleSafeMode}
            >
              <span className="account-action-toggle-copy">
                <span className="account-action-toggle-label">Safe mode</span>
                <span className="account-action-toggle-hint">
                  Hide NSFW and content warnings until you reveal them
                </span>
              </span>
              <span
                className={`account-safe-mode-switch${safeMode ? ' is-on' : ''}`}
                aria-hidden
              />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
