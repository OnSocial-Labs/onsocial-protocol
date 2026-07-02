'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckIcon,
  CopyIcon,
  LogoutIcon,
  OsIconAction,
  SheetCloseButton,
} from '@onsocial/ui';
import { Coins } from 'lucide-react';
import { displayName, fallbackLabel } from '@/lib/profile-display';

function AccountDrawerSubject({
  accountId,
  profileName,
  avatarUrl,
}: {
  accountId: string;
  profileName?: string;
  avatarUrl?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const handle = fallbackLabel(accountId);
  const name = displayName(accountId, profileName);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(accountId);
      setCopied(true);
    } catch {
      // ignore
    }
  }, [accountId]);

  return (
    <div className="account-drawer-subject">
      <span className="account-drawer-subject-avatar" aria-hidden>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="account-drawer-subject-avatar-img"
          />
        ) : (
          <span className="account-drawer-subject-avatar-fallback">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <span className="account-drawer-subject-copy">
        <span className="account-drawer-subject-name">{name}</span>
        <span className="account-drawer-handle-row">
          <span className="profile-handle account-drawer-handle">@{handle}</span>
          <button
            type="button"
            className="account-card-copy"
            onClick={() => void handleCopy()}
            aria-label={copied ? 'Address copied' : 'Copy address'}
          >
            {copied ? (
              <CheckIcon aria-hidden className="account-card-copy-icon" />
            ) : (
              <CopyIcon aria-hidden className="account-card-copy-icon" />
            )}
          </button>
        </span>
      </span>
    </div>
  );
}

/** Identity + close in the sheet header — mirrors standing glass drawer subject row. */
export function AccountDrawerChrome({
  titleId,
  srTitle,
  onClose,
  onWallet,
  onDisconnect,
  accountId,
  profileName,
  avatarUrl,
}: {
  titleId: string;
  srTitle: string;
  onClose: () => void;
  onWallet: () => void;
  onDisconnect: () => void;
  accountId: string;
  profileName?: string;
  avatarUrl?: string | null;
}) {
  return (
    <div className="account-drawer-header">
      <div className="account-drawer-subject-row">
        <AccountDrawerSubject
          accountId={accountId}
          profileName={profileName}
          avatarUrl={avatarUrl}
        />
        <div className="account-drawer-actions">
          <OsIconAction ariaLabel="Wallet" onClick={onWallet}>
            <Coins aria-hidden className="glass-sheet-icon-action-glyph" />
          </OsIconAction>
          <OsIconAction
            ariaLabel="Log out"
            onClick={onDisconnect}
            className="is-danger"
          >
            <LogoutIcon aria-hidden className="glass-sheet-icon-action-glyph" />
          </OsIconAction>
          <SheetCloseButton onClick={onClose} ariaLabel="Close" />
        </div>
      </div>
      <h2 id={titleId} className="sr-only">
        {srTitle}
      </h2>
    </div>
  );
}
