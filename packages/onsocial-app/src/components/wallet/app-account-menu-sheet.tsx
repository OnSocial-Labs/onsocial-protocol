'use client';

import { useState, type CSSProperties } from 'react';
import { ChevronRightIcon, OsHugSheet } from '@onsocial/ui';
import {
  AccountActionList,
  AccountShortcutDock,
} from '@/components/wallet/account-card-parts';
import { AppSocialHelpCard } from '@/components/wallet/app-social-help-card';
import { APP_SOCIAL_HELP_TITLE } from '@/lib/app-reward-constants';
import { SHEET_Z } from '@/lib/sheet-z';

interface AppAccountMenuSheetProps {
  open: boolean;
  onClose: () => void;
  accountId: string;
  pageMoodId?: string | null;
  panelStyle?: CSSProperties;
  isOwnerOnPage: boolean;
  onWalletClose: () => void;
  onEditProfile: () => void;
  onCustomize?: () => void;
  onMutedBlocked: () => void;
  onOpenTokens: () => void;
  safeMode?: boolean;
  onToggleSafeMode?: () => void;
  accessNeeded?: boolean;
  onOpenAccess: () => void;
  onSwitchWallet: () => void;
  onDisconnect: () => void | Promise<void>;
}

/** Profile, device, and log out. Sits above the wallet sheet. */
export function AppAccountMenuSheet({
  open,
  onClose,
  accountId,
  pageMoodId = null,
  panelStyle,
  isOwnerOnPage,
  onWalletClose,
  onEditProfile,
  onCustomize,
  onMutedBlocked,
  onOpenTokens,
  safeMode,
  onToggleSafeMode,
  accessNeeded = false,
  onOpenAccess,
  onSwitchWallet,
  onDisconnect,
}: AppAccountMenuSheetProps) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <OsHugSheet
        open={open}
        onClose={onClose}
        label="Account"
        zIndex={SHEET_Z.facts}
        moodId={pageMoodId ?? undefined}
        panelStyle={panelStyle}
        panelClassName="account-drawer-panel account-menu-sheet"
        chrome="plain"
      >
        <div className="account-card">
          <AccountActionList
            accountId={accountId}
            isOwnerOnPage={isOwnerOnPage}
            onClose={onWalletClose}
            onEditProfile={onEditProfile}
            onCustomize={onCustomize}
            onMutedBlocked={onMutedBlocked}
            onOpenTokens={onOpenTokens}
            safeMode={safeMode}
            onToggleSafeMode={onToggleSafeMode}
          />

          <button
            type="button"
            className="os-surface-row os-surface-row--navigate account-menu-row"
            onClick={() => setHelpOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={helpOpen}
          >
            <span className="os-surface-row-copy">
              <span className="os-surface-row-label">
                {APP_SOCIAL_HELP_TITLE}
              </span>
            </span>
            <ChevronRightIcon aria-hidden className="os-surface-row-arrow" />
          </button>

          <AccountShortcutDock
            accountId={accountId}
            onClose={onWalletClose}
            onOpenAccess={onOpenAccess}
            accessNeeded={accessNeeded}
            onSwitchWallet={onSwitchWallet}
            onDisconnect={onDisconnect}
          />
        </div>
      </OsHugSheet>

      <AppSocialHelpCard
        open={helpOpen && open}
        onClose={() => setHelpOpen(false)}
      />
    </>
  );
}
