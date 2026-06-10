'use client';

import Link from 'next/link';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { appPageHref } from '@/lib/app-links';
import { fallbackLabel } from '@/lib/profile-display';

interface AppWalletPillProps {
  pageAccountId: string;
}

export function AppWalletPill({ pageAccountId }: AppWalletPillProps) {
  const { accountId, isConnected, isLoading, connect, disconnect } =
    useAppWallet();

  if (isLoading) {
    return <div aria-hidden className="app-wallet-pill is-loading" />;
  }

  if (!isConnected || !accountId) {
    return (
      <button
        type="button"
        className="app-wallet-pill"
        onClick={connect}
        aria-label="Connect wallet"
      >
        Connect
      </button>
    );
  }

  const isOwner = accountId === pageAccountId;
  const label = fallbackLabel(accountId);

  return (
    <div className="app-wallet-pill is-connected">
      {isOwner ? (
        <span className="app-wallet-pill-label">@{label}</span>
      ) : (
        <Link className="app-wallet-pill-link" href={appPageHref(accountId)}>
          @{label}
        </Link>
      )}
      <button
        type="button"
        className="app-wallet-pill-disconnect"
        onClick={disconnect}
        aria-label="Disconnect wallet"
      >
        ×
      </button>
    </div>
  );
}
