'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GlassSheet, osHugSheetBodyClassName, useScrollLock } from '@onsocial/ui';
import {
  AccountActionList,
  AccountSessionChip,
  AccountShortcutDock,
  AccountWalletZone,
} from '@/components/wallet/account-card-parts';
import { AccountDrawerChrome } from '@/components/wallet/account-drawer-chrome';
import { AppProfileEditorSheet } from '@/components/wallet/app-profile-editor-sheet';
import { AppSocialSwapSheet } from '@/components/wallet/app-social-swap-sheet';
import { AppStorageSheet } from '@/components/wallet/app-storage-sheet';
import { MuteBlockListsSheet } from '@/components/wallet/mute-block-lists-sheet';
import { AppTokensSheet } from '@/features/tokens/app-tokens-sheet';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePlatformStorageSummary } from '@/hooks/use-platform-storage-summary';
import { usePortfolioCustomize } from '@/contexts/portfolio-customize-context';
import {
  usePortfolioProfileSeed,
  usePortfolioProfileSeedPatch,
} from '@/contexts/portfolio-profile-seed-context';
import { useViewerProfileShellContext } from '@/contexts/viewer-profile-shell-context';
import { useViewerWalletMoodVars } from '@/hooks/use-viewer-wallet-mood-vars';
import { useViewerSafeMode } from '@/hooks/use-viewer-safe-mode';
import { ACCOUNT_SHEET_PEEK_RATIO } from '@/lib/account-sheet-config';
import { accountSheetPageMoodPanel } from '@/lib/account-sheet-page-mood';
import { accountIdsEqual } from '@/lib/account-match';
import { accountDrawerPrimaryLabel } from '@/lib/profile-display';
import { SHEET_Z } from '@/lib/sheet-z';

interface AppAccountSheetProps {
  open: boolean;
  onClose: () => void;
  pageAccountId?: string;
}

interface IdentityOverride {
  displayName: string;
  avatarUrl: string | null;
}

/**
 * OS account drawer — identity-first glass sheet.
 * Differs from Portal dropdown: no title bar, content-sized panel, labeled rows.
 */
export function AppAccountSheet({
  open,
  onClose,
  pageAccountId,
}: AppAccountSheetProps) {
  const {
    accountId,
    hasSocialSession,
    isBootstrappingSession,
    resumeSocialSession,
    switchWallet,
    disconnect,
  } = useAppWallet();
  const customize = usePortfolioCustomize();
  const profileSeed = usePortfolioProfileSeed(accountId ?? '');
  const patchProfileSeed = usePortfolioProfileSeedPatch();
  const viewerShell = useViewerProfileShellContext();
  const { safeMode, toggleSafeMode } = useViewerSafeMode();
  const [closing, setClosing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [muteBlockOpen, setMuteBlockOpen] = useState(false);
  const [storageRefreshKey, setStorageRefreshKey] = useState(0);
  const [editorSession, setEditorSession] = useState(0);
  const [identityOverrides, setIdentityOverrides] = useState<
    Record<string, IdentityOverride>
  >({});
  const pendingCustomizeRef = useRef(false);
  const autoResumeAttemptedRef = useRef<string | null>(null);
  const editorOpenRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    editorOpenRef.current = editorOpen;
  }, [editorOpen]);

  const sheetOpen = open && !closing && !editorOpen;

  // Re-attempt session restore when the drawer opens (same as page-load bootstrap).
  useEffect(() => {
    if (
      !sheetOpen ||
      !accountId ||
      hasSocialSession ||
      isBootstrappingSession
    ) {
      return;
    }
    if (autoResumeAttemptedRef.current === accountId) return;
    autoResumeAttemptedRef.current = accountId;
    void resumeSocialSession();
  }, [
    sheetOpen,
    accountId,
    hasSocialSession,
    isBootstrappingSession,
    resumeSocialSession,
  ]);

  useEffect(() => {
    if (!accountId) autoResumeAttemptedRef.current = null;
  }, [accountId]);
  /*
   * Edit profile is an OS page (portaled into the phone card). The wallet is a
   * GlassSheet on document.body — keeping both open stacks the drawer on top
   * of the page. Hide the drawer while editing; keep editorOpen independent so
   * dismissing the wallet does not unmount the page.
   */
  const editorSheetOpen = editorOpen;
  const storageSheetOpen = storageOpen && open;
  const swapSheetOpen = swapOpen && open;
  const tokensSheetOpen = tokensOpen && open;
  const platformStorage = usePlatformStorageSummary(
    accountId,
    sheetOpen,
    storageRefreshKey
  );
  const isOwnerOnPage =
    Boolean(pageAccountId) &&
    Boolean(accountId) &&
    accountIdsEqual(accountId!, pageAccountId!);
  const { moodId: pageMoodId, style: pageMoodStyle } = useViewerWalletMoodVars(
    accountId ?? '',
    pageAccountId,
    Boolean(accountId)
  );
  const {
    panelClassSuffix: pageMoodPanelClass,
    panelStyle: accountPanelStyle,
  } = accountSheetPageMoodPanel(pageMoodId, pageMoodStyle);

  useScrollLock(open || closing);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    setStorageOpen(false);
    setSwapOpen(false);
    setTokensOpen(false);
    setMuteBlockOpen(false);
    if (editorOpenRef.current) {
      return;
    }
    onClose();

    if (pendingCustomizeRef.current) {
      pendingCustomizeRef.current = false;
      customize?.openCustomize();
    }
  }, [customize, onClose]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    requestClose();
  }, [disconnect, requestClose]);

  const handleSwitchWallet = useCallback(async () => {
    requestClose();
    await switchWallet();
  }, [requestClose, switchWallet]);

  const handleCustomize = useCallback(() => {
    pendingCustomizeRef.current = true;
    requestClose();
  }, [requestClose]);

  const handleEditProfile = useCallback(() => {
    setEditorSession((current) => current + 1);
    setEditorOpen(true);
  }, []);

  const handleMutedBlocked = useCallback(() => {
    setMuteBlockOpen(true);
  }, []);

  const handleEditorBack = useCallback(() => {
    setEditorOpen(false);
  }, []);

  const handleEditorClose = useCallback(() => {
    setEditorOpen(false);
  }, []);

  const handleOpenStorage = useCallback(() => {
    setStorageOpen(true);
  }, []);

  const handleOpenSwap = useCallback(() => {
    setSwapOpen(true);
  }, []);

  const handleOpenTokens = useCallback(() => {
    setTokensOpen(true);
  }, []);

  const handleTokensBack = useCallback(() => {
    setTokensOpen(false);
  }, []);

  const handleStorageBack = useCallback(() => {
    setStorageOpen(false);
  }, []);

  const handleSwapBack = useCallback(() => {
    setSwapOpen(false);
  }, []);

  const handleStorageChanged = useCallback(() => {
    setStorageRefreshKey((current) => current + 1);
  }, []);

  const handleProfileSaved = useCallback(
    (result: { name: string; avatarUrl: string | null }) => {
      if (!accountId) {
        return;
      }

      setIdentityOverrides((current) => ({
        ...current,
        [accountId]: {
          displayName: result.name,
          avatarUrl: result.avatarUrl,
        },
      }));
      patchProfileSeed(accountId, {
        displayName: result.name,
        avatarUrl: result.avatarUrl,
      });
      viewerShell?.patchShell({
        displayName: result.name,
        avatarUrl: result.avatarUrl,
      });
      setStorageRefreshKey((current) => current + 1);
    },
    [accountId, patchProfileSeed, viewerShell]
  );

  if (!accountId) {
    return null;
  }

  const identityOverride = identityOverrides[accountId];
  const seededName =
    profileSeed && accountIdsEqual(profileSeed.accountId, accountId)
      ? profileSeed.displayName
      : undefined;
  const seededAvatar =
    profileSeed && accountIdsEqual(profileSeed.accountId, accountId)
      ? profileSeed.avatarUrl
      : null;
  const profileName = identityOverride?.displayName ?? seededName;
  const avatarUrl =
    identityOverride?.avatarUrl ??
    seededAvatar ??
    viewerShell?.avatarUrl ??
    null;
  const srTitle = accountDrawerPrimaryLabel(accountId, profileName);

  return (
    <>
      <GlassSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        tone="os"
        sizing="hug"
        initialDetent="full"
        peekRatio={ACCOUNT_SHEET_PEEK_RATIO}
        zIndex={SHEET_Z.account}
        ariaLabelledBy="account-sheet-title"
        backdropLabel="Close"
        panelClassName={`account-drawer-panel os-sheet-cap-standard${pageMoodPanelClass}`}
        panelStyle={accountPanelStyle}
        bodyClassName={osHugSheetBodyClassName}
        bodyRef={bodyRef}
        header={
          <>
            <AccountDrawerChrome
              titleId="account-sheet-title"
              srTitle={srTitle}
              onClose={requestClose}
              accountId={accountId}
              profileName={profileName}
              avatarUrl={avatarUrl}
            />          </>
        }
      >
        <div className="account-card">
          {!hasSocialSession ? (
            <AccountSessionChip
              isBootstrapping={isBootstrappingSession}
              onResume={() => void resumeSocialSession()}
            />
          ) : null}

          <AccountWalletZone
            enabled={sheetOpen}
            onOpenStorage={handleOpenStorage}
            onOpenSwap={handleOpenSwap}
            platformStorageLoading={platformStorage.loading}
            platformStorageError={platformStorage.error}
            platformStorageSummary={platformStorage.summary}
          />

          <AccountActionList
            accountId={accountId}
            isOwnerOnPage={isOwnerOnPage}
            onClose={requestClose}
            onEditProfile={handleEditProfile}
            onCustomize={isOwnerOnPage ? handleCustomize : undefined}
            onMutedBlocked={handleMutedBlocked}
            onOpenTokens={handleOpenTokens}
            safeMode={safeMode}
            onToggleSafeMode={toggleSafeMode}
          />

          <AccountShortcutDock
            accountId={accountId}
            onClose={requestClose}
            onSwitchWallet={() => void handleSwitchWallet()}
            onDisconnect={() => void handleDisconnect()}
          />
        </div>
      </GlassSheet>

      <AppProfileEditorSheet
        open={editorSheetOpen}
        sessionKey={editorSession}
        accountId={accountId}
        pageAccountId={pageAccountId}
        onBack={handleEditorBack}
        onClose={handleEditorClose}
        onSaved={handleProfileSaved}
      />

      <AppStorageSheet
        open={storageSheetOpen}
        accountId={accountId}
        pageMoodId={pageMoodId}
        panelStyle={accountPanelStyle}
        refreshKey={storageRefreshKey}
        onClose={handleStorageBack}
        onStorageChanged={handleStorageChanged}
      />

      <AppSocialSwapSheet
        open={swapSheetOpen}
        panelStyle={accountPanelStyle}
        onClose={handleSwapBack}
      />

      <AppTokensSheet
        open={tokensSheetOpen}
        accountId={accountId}
        panelStyle={accountPanelStyle}
        onClose={handleTokensBack}
      />

      <MuteBlockListsSheet
        open={muteBlockOpen && open}
        onClose={() => setMuteBlockOpen(false)}
      />
    </>
  );
}
