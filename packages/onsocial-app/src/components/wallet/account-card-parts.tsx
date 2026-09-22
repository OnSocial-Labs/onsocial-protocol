'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  OsNoticeCard,
  OsSheetAction,
  OsSheetActions,
  PulsingDots,
} from '@onsocial/ui';
import Link from 'next/link';
import { APP_DISCOVER_PATH } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/app-config';
import {
  APP_ACTIVITY_METRIC_LABEL,
  APP_COLLECT_ACTION_LABEL,
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

/** Activity meter under the balance — Collect lives in the hero actions. */
export function AccountClaimMetricRow() {
  const rewards = useAppRewardsOptional();
  const claimableYocto = rewards?.claimableYocto ?? 0n;
  const canClaim = rewards?.canClaim ?? false;
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
      : canClaim
        ? 'Ready to collect'
        : null;

  if (rewardsLoading) {
    return (
      <div className="account-wallet-activity" aria-hidden>
        <span className="account-wallet-activity-label is-loading" />
        <span className="account-wallet-progress-track is-loading" />
      </div>
    );
  }

  return (
    <div className="account-wallet-activity">
      <div className="account-wallet-activity-head">
        <span className="account-wallet-activity-label">
          {APP_ACTIVITY_METRIC_LABEL}
        </span>
        <span
          className={`account-wallet-activity-ratio${canClaim ? ' is-ready' : ''}`}
        >
          {ratioLabel}
        </span>
      </div>
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
      {hintLine ? (
        <p
          className={`account-wallet-caption${sheetCreditHint ? ' is-credit' : ''}`}
          aria-live={sheetCreditHint ? 'polite' : undefined}
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

/** Wallet hero — readable balance, two thumb actions, then storage. */
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
  const claiming = rewards?.claiming ?? false;
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
      <div className="account-wallet-hero">
        <span className="account-card-balance-kicker">Wallet</span>
        <p className="account-card-balance-line" aria-live="polite">
          <span
            className={`account-card-balance-value${showWalletLoading ? ' is-loading' : ''}`}
            aria-hidden={showWalletLoading}
          >
            {showWalletLoading ? '0' : walletLabel}
          </span>
          <span className="account-card-balance-unit">SOCIAL</span>
        </p>
        {hintLine ? <p className="account-wallet-caption">{hintLine}</p> : null}
      </div>

      <div className="account-wallet-actions">
        {onOpenSwap ? (
          canClaim || claiming ? (
            <button
              type="button"
              className="account-wallet-action os-surface-chip"
              onClick={onOpenSwap}
            >
              Get SOCIAL
            </button>
          ) : (
            <OsSheetAction
              type="button"
              variant="primary"
              ready={!rewardsLoading}
              className="account-wallet-action"
              disabled={rewardsLoading}
              onClick={onOpenSwap}
            >
              Get SOCIAL
            </OsSheetAction>
          )
        ) : null}
        {claiming ? (
          <button
            type="button"
            className="account-wallet-action os-surface-chip is-ready"
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
            className={`account-wallet-action os-surface-chip${
              canClaim ? ' is-ready' : ''
            }`}
            disabled={!canClaim || rewardsLoading}
            onClick={() => void rewards?.claimRewards()}
          >
            {APP_COLLECT_ACTION_LABEL}
          </button>
        )}
      </div>

      <AccountClaimMetricRow />

      {onOpenStorage ? (
        <AccountStorageStrip
          loading={platformStorageLoading}
          error={platformStorageError}
          summary={platformStorageSummary}
          manageHighlighted={storageHighlighted}
          onOpenManage={onOpenStorage}
        />
      ) : null}

      <button
        type="button"
        className={`os-surface-row os-surface-row--navigate account-wallet-help${
          socialHelpOpen ? ' is-active' : ''
        }`}
        onClick={() => setSocialHelpOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={socialHelpOpen}
      >
        <span className="os-surface-row-copy">
          <span className="os-surface-row-label">{APP_SOCIAL_HELP_TITLE}</span>
        </span>
        <ChevronRightIcon aria-hidden className="os-surface-row-arrow" />
      </button>

      <AppSocialHelpCard open={socialHelpOpen} onClose={closeSocialHelp} />
    </section>
  );
}

interface AccountMenuRowProps {
  label: string;
  hint?: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  tone?: 'danger' | 'attention';
}

function AccountMenuRow({
  label,
  hint,
  href,
  external = false,
  onClick,
  tone,
}: AccountMenuRowProps) {
  const className = `os-surface-row os-surface-row--navigate account-menu-row${
    tone ? ` is-${tone}` : ''
  }`;
  const body = (
    <>
      <span className="os-surface-row-copy">
        <span className="os-surface-row-label">{label}</span>
        {hint ? (
          <span className="os-surface-row-description">{hint}</span>
        ) : null}
      </span>
      {external ? (
        <ExternalLinkIcon aria-hidden className="os-surface-row-external" />
      ) : (
        <ChevronRightIcon aria-hidden className="os-surface-row-arrow" />
      )}
    </>
  );

  if (href) {
    const link = (
      <Link
        href={href}
        className={className}
        aria-label={hint ? `${label}. ${hint}` : label}
        onClick={onClick}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      >
        {body}
      </Link>
    );
    return link;
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
  onOpenAccess: () => void;
  /** Orange attention when the session is missing or expired. */
  accessNeeded?: boolean;
  onSwitchWallet: () => void;
  onDisconnect: () => void | Promise<void>;
}

/** Labeled account actions. Log out asks before it disconnects. */
export function AccountShortcutDock({
  accountId,
  onClose,
  onOpenAccess,
  accessNeeded = false,
  onSwitchWallet,
  onDisconnect,
}: AccountShortcutDockProps) {
  const explorerHref = `${ACTIVE_NEAR_EXPLORER_URL}/address/${accountId}`;
  const titleId = useId();
  const confirmRef = useRef<HTMLDivElement>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);

  useEffect(() => {
    if (!confirmingLogout) {
      return;
    }
    confirmRef.current?.scrollIntoView({ block: 'nearest' });
  }, [confirmingLogout]);

  const confirmLogout = useCallback(async () => {
    setLogoutPending(true);
    try {
      await onDisconnect();
    } finally {
      setLogoutPending(false);
    }
  }, [onDisconnect]);

  return (
    <nav className="account-shortcut-dock" aria-label="Account shortcuts">
      <AccountMenuRow
        label="Discover"
        hint="Find people and pages"
        href={APP_DISCOVER_PATH}
        onClick={onClose}
      />
      <AccountMenuRow
        label="Explorer"
        hint="View this account on Nearblocks"
        href={explorerHref}
        external
        onClick={onClose}
      />
      <AccountMenuRow
        label="App access"
        hint={accessNeeded ? 'Allow this device' : 'Keys on this device'}
        tone={accessNeeded ? 'attention' : undefined}
        onClick={onOpenAccess}
      />
      <AccountMenuRow
        label="Switch wallet"
        hint="Use a different account"
        onClick={onSwitchWallet}
      />
      {confirmingLogout ? (
        <div ref={confirmRef}>
          <OsNoticeCard
            align="start"
            title="Log out?"
            titleId={titleId}
            body="You’ll need to connect again to collect, post, or edit your page."
            footer={
              <OsSheetActions layout="row">
                <OsSheetAction
                  type="button"
                  variant="ghost"
                  disabled={logoutPending}
                  onClick={() => setConfirmingLogout(false)}
                >
                  Cancel
                </OsSheetAction>
                <OsSheetAction
                  type="button"
                  variant="danger"
                  ready
                  pending={logoutPending}
                  pendingLabel="Logging out"
                  onClick={() => void confirmLogout()}
                >
                  Log out
                </OsSheetAction>
              </OsSheetActions>
            }
          />
        </div>
      ) : (
        <AccountMenuRow
          label="Log out"
          hint="Disconnect this device"
          tone="danger"
          onClick={() => setConfirmingLogout(true)}
        />
      )}
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

/** Account list — one labeled row per action, then device toggles. */
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

  const rows: AccountMenuRowProps[] = [
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
            label: 'Muted and blocked',
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
      <nav className="account-action-list" aria-label="Account actions">
        {rows.map((row) => (
          <AccountMenuRow key={row.label} {...row} />
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
                      ? 'On for this device'
                      : 'Off for this device'}
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
                  Hide sensitive posts until you reveal them
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
