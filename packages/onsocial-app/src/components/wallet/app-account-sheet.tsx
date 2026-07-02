'use client';

import { useCallback, useRef, useState } from 'react';
import { GlassSheet, Divider } from '@onsocial/ui';
import {
  AccountActionList,
  AccountSessionChip,
  AccountWalletZone,
} from '@/components/wallet/account-card-parts';
import { AccountDrawerChrome } from '@/components/wallet/account-drawer-chrome';
import { AppProfileEditorSheet } from '@/components/wallet/app-profile-editor-sheet';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePortfolioCustomize } from '@/contexts/portfolio-customize-context';
import { usePortfolioProfileSeed } from '@/contexts/portfolio-profile-seed-context';
import { useViewerProfileShellContext } from '@/contexts/viewer-profile-shell-context';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { ACCOUNT_SHEET_PEEK_RATIO } from '@/lib/account-sheet-config';
import { accountIdsEqual } from '@/lib/account-match';
import { displayName } from '@/lib/profile-display';

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
    connect,
    disconnect,
  } = useAppWallet();
  const customize = usePortfolioCustomize();
  const profileSeed = usePortfolioProfileSeed(accountId ?? '');
  const viewerShell = useViewerProfileShellContext();
  const [closing, setClosing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [identityOverrides, setIdentityOverrides] = useState<
    Record<string, IdentityOverride>
  >({});
  const pendingCustomizeRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const sheetOpen = open && !closing;
  const editorSheetOpen = editorOpen && open;
  const isOwnerOnPage =
    Boolean(pageAccountId) &&
    Boolean(accountId) &&
    accountIdsEqual(accountId!, pageAccountId!);

  useScrollLock(open || closing);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    setEditorOpen(false);
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

  const focusWallet = useCallback(() => {
    const body = bodyRef.current;
    const zone = document.getElementById('account-sheet-wallet-zone');
    if (!body || !zone) {
      return;
    }

    const bodyTop = body.getBoundingClientRect().top;
    const zoneTop = zone.getBoundingClientRect().top;
    body.scrollTo({
      top: body.scrollTop + zoneTop - bodyTop - 8,
      behavior: 'smooth',
    });
  }, []);

  const handleCustomize = useCallback(() => {
    pendingCustomizeRef.current = true;
    requestClose();
  }, [requestClose]);

  const handleEditProfile = useCallback(() => {
    setEditorSession((current) => current + 1);
    setEditorOpen(true);
  }, []);

  const handleEditorBack = useCallback(() => {
    setEditorOpen(false);
  }, []);

  const handleEditorClose = useCallback(() => {
    setEditorOpen(false);
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
      viewerShell?.patchShell({
        displayName: result.name,
        avatarUrl: result.avatarUrl,
      });
    },
    [accountId, viewerShell]
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
    identityOverride?.avatarUrl ?? seededAvatar ?? viewerShell?.avatarUrl ?? null;
  const srTitle = displayName(accountId, profileName);

  return (
    <>
      <GlassSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        tone="os"
        initialDetent="full"
        peekRatio={ACCOUNT_SHEET_PEEK_RATIO}
        zIndex={55}
        ariaLabelledBy="account-sheet-title"
        backdropLabel="Close"
        panelClassName="account-drawer-panel"
        bodyClassName="account-card-body"
        bodyRef={bodyRef}
        header={
          <>
            <AccountDrawerChrome
              titleId="account-sheet-title"
              srTitle={srTitle}
              onClose={requestClose}
              onWallet={focusWallet}
              onDisconnect={() => void handleDisconnect()}
              accountId={accountId}
              profileName={profileName}
              avatarUrl={avatarUrl}
            />
            <Divider variant="section" className="glass-sheet-header-divider" />
          </>
        }
      >
        <div className="account-card">
          {!hasSocialSession ? (
            <AccountSessionChip
              isBootstrapping={isBootstrappingSession}
              onResume={() => void connect()}
            />
          ) : null}

          <AccountWalletZone accountId={accountId} enabled={sheetOpen} />

          <AccountActionList
            accountId={accountId}
            isOwnerOnPage={isOwnerOnPage}
            onClose={requestClose}
            onEditProfile={handleEditProfile}
            onCustomize={isOwnerOnPage ? handleCustomize : undefined}
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
    </>
  );
}
