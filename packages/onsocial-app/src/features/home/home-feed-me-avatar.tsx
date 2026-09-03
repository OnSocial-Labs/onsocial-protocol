'use client';

import { AccountAvatar } from '@/components/profile/account-avatar';
import { useAppAccountSheet } from '@/contexts/app-account-sheet-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerProfileShellContext } from '@/contexts/viewer-profile-shell-context';
import { fallbackLabel } from '@/lib/profile-display';

/** Home leading control — opens account sheet (same as dock account zone). */
export function HomeFeedMeAvatar() {
  const { accountId, isConnected, isLoading, connect } = useAppWallet();
  const { open, openAccountSheet } = useAppAccountSheet();
  const viewerShell = useViewerProfileShellContext();
  const avatarUrl = viewerShell?.avatarUrl ?? null;
  const shellLoading =
    Boolean(isLoading || viewerShell?.isLoading) && !avatarUrl;

  if (!isConnected || !accountId) {
    if (isLoading) {
      return (
        <span className="home-feed-me-avatar" aria-hidden>
          <AccountAvatar size="sm" shellLoading />
        </span>
      );
    }

    return (
      <button
        type="button"
        className="home-feed-me-avatar is-connect"
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
      className="home-feed-me-avatar is-you"
      aria-label={`You, @${label}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      title={`@${label}`}
      onClick={() => openAccountSheet()}
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
