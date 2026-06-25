'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Wallet, ChevronDown, User, Copy, Check } from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { ProfileEditor } from '@/components/profile-editor';
import { PortalRewardsRulesModal } from '@/components/portal-rewards-rules-modal';
import { WalletAssetsModal } from '@/components/wallet-assets-modal';
import { WalletStorageModal } from '@/components/wallet-storage-modal';
import { WalletRewardsSection } from '@/components/wallet-rewards-panel';
import { WalletPlatformStorageStrip } from '@/components/platform-storage-allowance-summary';
import { WalletMenuActionDock } from '@/components/wallet-menu-actions';
import { cn } from '@/lib/utils';
import {
  walletMenuCardClass,
  walletMenuInnerDividerClass,
  walletMenuMetricsBlockClass,
  walletMenuPanelWidthClass,
  walletMenuProfileHoverClass,
  walletMenuIdentityNameClass,
  walletMenuIdentityHandleClass,
  walletMenuIdentityWelcomeClass,
  walletMenuSectionShellClass,
} from '@/components/ui/floating-panel';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import {
  utilityButtonActiveClass,
  utilityButtonClass,
  utilityIconTransition,
} from '@/components/ui/utility-button';
import { useDropdown } from '@/hooks/use-dropdown';
import { useProfile } from '@/contexts/profile-context';
import { usePortalRewards } from '@/contexts/portal-rewards-context';
import { useSocialWalletBalance } from '@/hooks/use-social-wallet-balance';
import { usePlatformStorageSummary } from '@/hooks/use-platform-storage-summary';
import { storageManageIsHighlighted } from '@/lib/user-storage-display';
import {
  walletDropdownAccessoryButtonClass,
  walletDropdownAccessoryIconClass,
  walletDropdownAccessoryIconStroke,
} from '@/components/ui/inline-icon-button';
import {
  profileSocialStandingArrowClass,
  walletMenuActionButtonClass,
} from '@/components/ui/profile-action-pill';
import { CompactActionPillPending } from '@/components/ui/profile-social-standing-toggle';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/near-network';
import { getPortalProfileUrl } from '@/lib/portal-config';
import { walletLabelFromAccountId } from '@/lib/wallet-label';
import {
  markWalletMenuSeen,
  walletMenuWelcomeLabel,
  type WalletMenuWelcomeLabel,
} from '@/lib/wallet-menu-welcome';

interface WalletButtonProps {
  compact?: boolean;
  menuAlign?: 'left' | 'right';
  disconnectedLabel?: string;
}

function WalletAvatar({
  avatarUrl,
  isLoading = false,
  className,
}: {
  avatarUrl: string | null;
  isLoading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-muted/30 text-muted-foreground',
        className
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : isLoading ? (
        <div className="h-full w-full animate-pulse bg-muted/50" aria-hidden />
      ) : (
        <User className="h-4 w-4" />
      )}
    </div>
  );
}

function WalletAccountCopyButton({ accountId }: { accountId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(accountId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — no UI spam.
    }
  };

  const copyLabel = copied ? 'Account ID copied' : 'Copy account ID';

  return (
    <button
      type="button"
      onClick={(event) => {
        void handleCopy(event);
      }}
      className={cn(
        walletDropdownAccessoryButtonClass,
        'pointer-events-auto shrink-0',
        copied &&
          'text-[var(--portal-green)] hover:border-[var(--portal-green-border)]/40 hover:bg-[var(--portal-green-bg)] hover:text-[var(--portal-green)] active:text-[var(--portal-green)] focus-visible:ring-[var(--portal-green-border)]'
      )}
      aria-label={copyLabel}
    >
      {copied ? (
        <Check
          className={walletDropdownAccessoryIconClass}
          strokeWidth={walletDropdownAccessoryIconStroke}
        />
      ) : (
        <Copy
          className={walletDropdownAccessoryIconClass}
          strokeWidth={walletDropdownAccessoryIconStroke}
        />
      )}
    </button>
  );
}

function WalletMenuIdentity({
  welcomeLabel,
  profilePrimaryLabel,
  hasProfileName,
  accountId,
  hasProfile,
  profilePageUrl,
  onEdit,
}: {
  welcomeLabel: WalletMenuWelcomeLabel;
  profilePrimaryLabel: string | undefined;
  hasProfileName: boolean;
  accountId: string | null;
  hasProfile: boolean;
  profilePageUrl: string | null;
  onEdit: () => void;
}) {
  return (
    <div className="group/identity relative -mx-2 px-2 py-1.5 md:-mx-2.5 md:px-2.5 md:py-2">
      {profilePageUrl ? (
        <a
          href={profilePageUrl}
          className={cn(
            'absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-gold-accent)] md:rounded-xl',
            walletMenuProfileHoverClass,
            'group-hover/identity:bg-[var(--portal-neutral-bg)]'
          )}
          aria-label={`Open profile for ${profilePrimaryLabel ?? accountId ?? 'account'}`}
          onClick={(event) => event.stopPropagation()}
        />
      ) : null}
      <div className="relative z-10 pointer-events-none">
        <div className="flex items-center justify-between gap-2">
          <p className={walletMenuIdentityWelcomeClass}>{welcomeLabel}</p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            className={cn(
              walletMenuActionButtonClass(hasProfile ? 'edit' : 'create'),
              'pointer-events-auto shrink-0'
            )}
          >
            {hasProfile ? (
              'Edit'
            ) : (
              <>
                <ProtocolMotionArrow
                  className={cn(
                    profileSocialStandingArrowClass(),
                    'opacity-100'
                  )}
                />
                Create
              </>
            )}
          </button>
        </div>
        <p
          className={cn(
            walletMenuIdentityNameClass,
            'mt-0.5 leading-none transition-colors',
            hasProfileName
              ? 'text-foreground'
              : 'text-muted-foreground/80 group-hover/identity:text-muted-foreground/90'
          )}
        >
          {profilePrimaryLabel}
        </p>
        {accountId ? (
          <div className="-mt-0.5 flex items-center gap-1.5">
            <p
              className={cn(
                walletMenuIdentityHandleClass,
                'flex-1 transition-colors group-hover/identity:text-muted-foreground/70'
              )}
            >
              @{accountId}
            </p>
            <WalletAccountCopyButton accountId={accountId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function WalletButton({
  compact = false,
  menuAlign = 'right',
  disconnectedLabel,
}: WalletButtonProps) {
  const router = useRouter();
  const {
    accountId,
    isConnected,
    isLoading: isWalletBootstrapping,
    connect,
    switchWallet,
    disconnect,
  } = useWallet();
  const profileState = useProfile();
  const {
    claimableYocto,
    canClaim,
    claiming,
    loading: rewardsLoading,
    remainingToClaimYocto,
    claimRewards,
    refreshBalance,
  } = usePortalRewards();
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileEditorKey, setProfileEditorKey] = useState(0);
  const [rewardsRulesOpen, setRewardsRulesOpen] = useState(false);
  const [walletAssetsOpen, setWalletAssetsOpen] = useState(false);
  const [walletStorageOpen, setWalletStorageOpen] = useState(false);
  const [walletBalanceRefreshKey, setWalletBalanceRefreshKey] = useState(0);
  const [platformStorageRefreshKey, setPlatformStorageRefreshKey] = useState(0);
  const {
    balanceYocto: walletBalanceYocto,
    hasLoadedBalance: walletHasLoadedBalance,
    loading: walletBalanceLoading,
    error: walletBalanceError,
  } = useSocialWalletBalance(accountId, walletBalanceRefreshKey);
  const {
    isOpen: menuOpen,
    close: closeMenu,
    toggle: toggleMenu,
    containerRef: menuRef,
  } = useDropdown();
  const platformStorage = usePlatformStorageSummary(
    accountId,
    menuOpen || walletStorageOpen,
    platformStorageRefreshKey
  );

  const welcomeLabel: WalletMenuWelcomeLabel =
    accountId && menuOpen ? walletMenuWelcomeLabel(accountId) : 'Welcome';

  useEffect(() => {
    if (!menuOpen || !accountId) return;
    return () => {
      markWalletMenuSeen(accountId);
    };
  }, [accountId, menuOpen]);

  const handleMenuToggle = () => {
    if (!menuOpen && accountId) {
      void refreshBalance({ silent: true });
      setWalletBalanceRefreshKey((key) => key + 1);
    }
    toggleMenu();
  };

  const handleDisconnect = async () => {
    await disconnect();
    closeMenu();
  };

  const handleSwitchWallet = async () => {
    closeMenu();
    await switchWallet();
  };

  const openProfileEditor = () => {
    setProfileEditorKey((current) => current + 1);
    setProfileEditorOpen(true);
  };

  const openProfileDiscovery = () => {
    closeMenu();
    router.push('/discover');
  };

  const handleProfileAction = () => {
    closeMenu();
    openProfileEditor();
  };

  const openRewardsRules = () => {
    closeMenu();
    setRewardsRulesOpen(true);
  };

  const openWalletAssets = () => {
    closeMenu();
    setWalletAssetsOpen(true);
  };

  const openWalletStorage = () => {
    closeMenu();
    setWalletStorageOpen(true);
  };

  const walletLabel = accountId ? walletLabelFromAccountId(accountId) : '';
  const displayName = profileState.profile?.name ?? walletLabel;
  const hasProfileName = Boolean(profileState.profile?.name?.trim());
  const hasProfile = profileState.hasProfile;
  const profilePrimaryLabel = hasProfileName
    ? profileState.profile?.name
    : walletLabel;
  const profilePageUrl = accountId ? getPortalProfileUrl(accountId) : null;

  const compactDisconnectedButtonClass = disconnectedLabel
    ? 'group relative inline-flex h-9 w-auto items-center justify-center gap-2.5 rounded-full border border-border/45 bg-background/70 px-3 pr-3.5 text-muted-foreground backdrop-blur-md transition-all duration-300 hover:border-border/70 hover:bg-background/84 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background md:h-10 md:px-3.5 md:pr-4'
    : 'group relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/45 bg-background/70 text-foreground backdrop-blur-md transition-all duration-300 hover:border-border/70 hover:bg-background/84 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background md:h-10 md:w-10';

  if (isWalletBootstrapping) {
    return (
      <div
        role="status"
        aria-label="Checking wallet connection"
        aria-busy="true"
        className={cn(
          compact
            ? cn(
                compactDisconnectedButtonClass,
                'pointer-events-none animate-pulse bg-background/55'
              )
            : 'h-9 w-[7.5rem] animate-pulse rounded-full border border-border/45 bg-background/55 sm:w-[8.5rem]'
        )}
      />
    );
  }

  if (!isConnected) {
    return (
      <button
        onClick={() => connect()}
        className={cn(
          compact
            ? compactDisconnectedButtonClass
            : 'portal-blue-surface flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all'
        )}
        aria-label="Connect wallet"
      >
        {compact ? (
          <>
            <motion.span
              initial={false}
              animate={{
                opacity: 0.5,
                scale: 1,
                rotate: 0,
              }}
              transition={utilityIconTransition}
              className="pointer-events-none absolute inset-1 rounded-[0.9rem] bg-transparent dark:bg-[color:var(--portal-blue-frame-bg)]"
            />

            <motion.span
              initial={false}
              animate={{
                rotate: 180,
                scale: 1,
                opacity: 0.14,
              }}
              transition={utilityIconTransition}
              className="pointer-events-none absolute inset-[7px] rounded-[0.8rem] bg-transparent dark:bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.45),transparent_62%)]"
            />

            <span className="relative z-10 h-4 w-4">
              <motion.span
                initial={false}
                animate={{
                  scale: 1,
                  rotate: 0,
                  y: 0,
                  opacity: 1,
                }}
                transition={utilityIconTransition}
                className="absolute inset-0 flex items-center justify-center portal-blue-text"
              >
                <Wallet className="h-4 w-4" />
              </motion.span>

              <motion.span
                initial={false}
                animate={{
                  opacity: 0.72,
                  scale: 0.96,
                }}
                transition={utilityIconTransition}
                className="absolute inset-0 rounded-full bg-transparent blur-[6px] dark:bg-[var(--portal-blue)]/18"
              />
            </span>

            {disconnectedLabel ? (
              <span className="relative z-10 whitespace-nowrap text-sm font-medium text-current transition-colors">
                {disconnectedLabel}
              </span>
            ) : null}
          </>
        ) : (
          <Wallet className="h-4 w-4" />
        )}
        {!compact ? (
          <span className="hidden sm:inline">Let's connect</span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="relative inline-flex shrink-0 items-center" ref={menuRef}>
      <button
        onClick={handleMenuToggle}
        className={cn(
          compact
            ? cn(
                utilityButtonClass,
                'overflow-hidden border border-border/45 bg-background/70 p-0 text-foreground shadow-[0_12px_30px_-18px_rgba(15,23,42,0.34)] hover:border-border/70 hover:bg-background/84',
                menuOpen && utilityButtonActiveClass
              )
            : 'flex items-center gap-2 rounded-full border border-border/40 bg-background/65 px-2 py-1.5 text-muted-foreground shadow-[0_10px_30px_-18px_rgba(15,23,42,0.34)] backdrop-blur-md transition-all duration-300 hover:bg-background/80 hover:text-foreground'
        )}
        aria-label={menuOpen ? 'Close wallet menu' : 'Open wallet menu'}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        {compact ? (
          <WalletAvatar
            avatarUrl={profileState.avatarUrl}
            isLoading={profileState.isLoading}
            className="h-full w-full border-0"
          />
        ) : (
          <>
            <WalletAvatar
              avatarUrl={profileState.avatarUrl}
              isLoading={profileState.isLoading}
              className="h-8 w-8"
            />
            <span className="max-w-[100px] truncate text-sm font-medium text-foreground hidden sm:block">
              {displayName}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${menuOpen ? 'rotate-180' : ''}`}
            />
          </>
        )}
      </button>

      <FloatingPanelMenu
        open={menuOpen}
        align={menuAlign === 'left' ? 'left' : 'right'}
        offsetClass="mt-1"
        className={walletMenuPanelWidthClass}
      >
        <div className={walletMenuSectionShellClass}>
          <div className={walletMenuCardClass}>
            <WalletMenuIdentity
              welcomeLabel={welcomeLabel}
              profilePrimaryLabel={profilePrimaryLabel}
              hasProfileName={hasProfileName}
              accountId={accountId}
              hasProfile={hasProfile}
              profilePageUrl={profilePageUrl}
              onEdit={handleProfileAction}
            />

            <div
              className={walletMenuInnerDividerClass}
              role="separator"
              aria-hidden
            />

            <div className={walletMenuMetricsBlockClass}>
              <WalletRewardsSection
                compact
                walletBalanceYocto={walletBalanceYocto}
                walletBalanceLoading={walletBalanceLoading}
                walletBalanceError={walletBalanceError}
                walletHasLoadedBalance={walletHasLoadedBalance}
                claimableYocto={claimableYocto}
                canClaim={canClaim}
                claiming={claiming}
                rewardsLoading={rewardsLoading}
                remainingToClaimYocto={remainingToClaimYocto}
                onClaim={async () => {
                  await claimRewards();
                  setWalletBalanceRefreshKey((key) => key + 1);
                }}
                onOpenRules={openRewardsRules}
                onOpenAssets={openWalletAssets}
              />

              <WalletPlatformStorageStrip
                compact
                loading={platformStorage.loading}
                error={platformStorage.error}
                summary={platformStorage.summary}
                onOpenManage={openWalletStorage}
                manageHighlighted={storageManageIsHighlighted(
                  platformStorage.summary
                )}
              />
            </div>

            <div
              className={walletMenuInnerDividerClass}
              role="separator"
              aria-hidden
            />

            <WalletMenuActionDock
              onDiscover={openProfileDiscovery}
              onExplorer={() => {
                window.open(
                  `${ACTIVE_NEAR_EXPLORER_URL}/address/${accountId}`,
                  '_blank'
                );
                closeMenu();
              }}
              onSwitch={handleSwitchWallet}
              onDisconnect={handleDisconnect}
            />
          </div>
        </div>
      </FloatingPanelMenu>

      <ProfileEditor
        key={profileEditorKey}
        open={profileEditorOpen}
        accountId={accountId}
        profile={profileState.profile}
        avatarUrl={profileState.avatarUrl}
        bannerUrl={profileState.bannerUrl}
        isSaving={profileState.isSaving}
        isAuthorizingSession={profileState.isAuthorizingSession}
        hasSocialSession={profileState.hasSocialSession}
        error={profileState.error}
        onOpenChange={setProfileEditorOpen}
        onSave={profileState.saveProfile}
      />

      <PortalRewardsRulesModal
        open={rewardsRulesOpen}
        accountId={accountId}
        onOpenChange={setRewardsRulesOpen}
      />

      <WalletAssetsModal
        open={walletAssetsOpen}
        onOpenChange={setWalletAssetsOpen}
        accountId={accountId}
      />

      <WalletStorageModal
        open={walletStorageOpen}
        onOpenChange={setWalletStorageOpen}
        accountId={accountId}
        refreshKey={platformStorageRefreshKey}
        onStorageChanged={() => {
          setPlatformStorageRefreshKey((key) => key + 1);
        }}
      />
    </div>
  );
}
