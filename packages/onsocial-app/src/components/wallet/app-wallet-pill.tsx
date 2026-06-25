'use client';

import Link from 'next/link';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import { appPageHref } from '@/lib/app-links';
import { fallbackLabel } from '@/lib/profile-display';

interface AppWalletPillProps {
  pageAccountId?: string;
  variant?: 'default' | 'corner';
}

export function AppWalletPill({
  pageAccountId,
  variant = 'default',
}: AppWalletPillProps) {
  const { accountId, isConnected, isLoading, connect, disconnect } =
    useAppWallet();

  const className =
    variant === 'corner' ? 'app-wallet-pill is-corner' : 'app-wallet-pill';

  if (isLoading) {
    return (
      <div
        aria-hidden
        className={`${className}${variant === 'corner' ? ' is-loading' : ' is-loading'}`}
      />
    );
  }

  if (!isConnected || !accountId) {
    return (
      <button
        type="button"
        className={className}
        onClick={connect}
        aria-label="Connect wallet"
      >
        {variant === 'corner' ? (
          <span className="app-wallet-corner-icon" aria-hidden>
            ◉
          </span>
        ) : (
          'Connect'
        )}
      </button>
    );
  }

  const isOwner = pageAccountId
    ? Boolean(accountId) && accountIdsEqual(accountId!, pageAccountId)
    : true;
  const label = fallbackLabel(accountId);

  if (variant === 'corner') {
    return (
      <div className={`${className} is-connected`}>
        <Link
          className="app-wallet-pill-link"
          href={appPageHref(accountId)}
          aria-label={`@${label}`}
          title={`@${label}`}
        >
          <span className="app-wallet-corner-initial" aria-hidden>
            {label.charAt(0).toUpperCase()}
          </span>
        </Link>
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

  return (
    <div className={`${className} is-connected`}>
      {isOwner && pageAccountId ? (
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
