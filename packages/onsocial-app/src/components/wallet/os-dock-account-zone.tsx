'use client';

import { AccountAvatar } from '@/components/profile/account-avatar';
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
  const shellLoading =
    Boolean(isLoading || viewerShell?.isLoading) && !avatarUrl;

  if (!isConnected || !accountId) {
    if (isLoading) {
      return (
        <span className="portfolio-summon-account" aria-hidden>
          <AccountAvatar size="sm" shellLoading />
        </span>
      );
    }

    return (
      <button
        type="button"
        className="portfolio-summon-account is-connect"
        aria-label="Connect wallet"
        onClick={() => {
          void connect();
        }}
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
      onClick={() => {
        openAccountSheet({ pageAccountId });
      }}
    >
      <AccountAvatar
        accountId={accountId}
        kind={viewerShell?.kind}
        src={avatarUrl}
        fallbackInitial={label}
        shellLoading={shellLoading}
        size="sm"
      />
    </button>
  );
}
