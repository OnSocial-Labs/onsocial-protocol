'use client';

import { useAppAccountSheet } from '@/contexts/app-account-sheet-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerProfileShellContext } from '@/contexts/viewer-profile-shell-context';
import { fallbackLabel } from '@/lib/profile-display';

interface OsDockAccountZoneProps {
  pageAccountId?: string;
}

/** Left segment of the unified OS dock pill — account sheet or connect. */
export function OsDockAccountZone({ pageAccountId }: OsDockAccountZoneProps) {
  const { accountId, isConnected, isLoading, connect } = useAppWallet();
  const { open, openAccountSheet } = useAppAccountSheet();
  const viewerShell = useViewerProfileShellContext();
  const avatarUrl = viewerShell?.avatarUrl ?? null;

  if (isLoading) {
    return (
      <span className="portfolio-summon-account is-loading" aria-hidden>
        <span className="portfolio-summon-account-initial" />
      </span>
    );
  }

  if (!isConnected || !accountId) {
    return (
      <button
        type="button"
        className="portfolio-summon-account is-connect"
        aria-label="Connect wallet"
        onClick={() => void connect()}
      >
        <span className="app-wallet-connect-glyph" aria-hidden />
      </button>
    );
  }

  const label = fallbackLabel(accountId);

  return (
    <button
      type="button"
      className="portfolio-summon-account is-you"
      aria-label={`You, @${label}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      title={`@${label}`}
      onClick={() => openAccountSheet({ pageAccountId })}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="portfolio-summon-account-avatar"
        />
      ) : (
        <span className="portfolio-summon-account-initial" aria-hidden>
          {label.charAt(0).toUpperCase()}
        </span>
      )}
    </button>
  );
}
