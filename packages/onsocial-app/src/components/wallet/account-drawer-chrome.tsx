'use client';

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { CheckIcon, CopyIcon, standingIdentityAccountCopy } from '@onsocial/ui';
import type { ProfileKind } from '@onsocial/sdk';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { SheetChromeHeader } from '@/components/panels/sheet-chrome-header';
import { portfolioPath } from '@/lib/overlay-routes';
import { accountDrawerPrimaryLabel } from '@/lib/profile-display';

function AccountDrawerHandle({ accountId }: { accountId: string }) {
  const [copied, setCopied] = useState(false);
  const handleLabel = standingIdentityAccountCopy(accountId);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void navigator.clipboard.writeText(accountId).then(
        () => setCopied(true),
        () => undefined
      );
    },
    [accountId]
  );

  return (
    <button
      type="button"
      className={`account-drawer-handle${copied ? ' is-copied' : ''}`}
      onClick={handleCopy}
      aria-label={copied ? 'Address copied' : `Copy ${handleLabel}`}
    >
      <span className="account-drawer-handle-id" title={accountId}>
        {handleLabel}
      </span>
      <span className="account-drawer-handle-copy" aria-hidden>
        <CopyIcon className="account-drawer-handle-copy-icon" />
        <CheckIcon className="account-drawer-handle-copy-icon account-drawer-handle-copy-tick" />
      </span>
    </button>
  );
}

/** Identity — name opens the page; @handle and the copy icon share the line under it. */
export function AccountDrawerChrome({
  titleId,
  srTitle,
  onClose,
  accountId,
  profileName,
  avatarUrl,
  kind,
}: {
  titleId: string;
  srTitle: string;
  onClose: () => void;
  accountId: string;
  profileName?: string;
  avatarUrl?: string | null;
  kind?: ProfileKind | null;
}) {
  const primaryLabel = accountDrawerPrimaryLabel(accountId, profileName);

  return (
    <SheetChromeHeader
      className="account-drawer-header"
      rowClassName="standing-sheet-subject-row account-drawer-subject-row"
      actionsClassName="account-drawer-actions"
      onClose={onClose}
      closeAriaLabel="Close"
      toolbar={
        <h2 id={titleId} className="sr-only">
          {srTitle}
        </h2>
      }
      toolbarClassName={null}
    >
      <div className="account-drawer-identity">
        <Link
          href={portfolioPath(accountId)}
          className="account-drawer-face"
          aria-label={`${primaryLabel} portfolio`}
          onClick={onClose}
        >
          <AccountAvatar
            accountId={accountId}
            kind={kind}
            src={avatarUrl ?? null}
            fallbackInitial={primaryLabel}
            size="md"
            className="account-drawer-avatar"
          />
          <span className="account-drawer-name">{primaryLabel}</span>
        </Link>
        <AccountDrawerHandle accountId={accountId} />
      </div>
    </SheetChromeHeader>
  );
}
