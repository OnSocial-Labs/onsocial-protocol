'use client';

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import {
  osChromeSubjectClassName,
  standingIdentityAccountCopy,
} from '@onsocial/ui';
import type { ProfileKind } from '@onsocial/sdk';
import { OsChromeSubject } from '@/components/profile/os-chrome-subject';
import { SheetChromeHeader } from '@/components/panels/sheet-chrome-header';
import { portfolioPath } from '@/lib/overlay-routes';
import { accountDrawerPrimaryLabel } from '@/lib/profile-display';

function AccountDrawerAddressCopy({ accountId }: { accountId: string }) {
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
      className={`account-drawer-address${copied ? ' is-copied' : ''}`}
      onClick={handleCopy}
      title={accountId}
      aria-label={copied ? 'Address copied' : `Copy ${handleLabel}`}
    >
      <span className="account-drawer-address-id">{handleLabel}</span>
      <span className="account-drawer-address-action">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  );
}

/** Identity row — page link and address copy are separate tap targets. */
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
          className={osChromeSubjectClassName}
          aria-label={`${primaryLabel} portfolio`}
          onClick={onClose}
        >
          <OsChromeSubject
            accountId={accountId}
            profileName={profileName}
            avatarUrl={avatarUrl}
            kind={kind}
            primaryLabel={primaryLabel}
            showHandle={false}
            unstyled
          />
        </Link>
        <AccountDrawerAddressCopy accountId={accountId} />
      </div>
    </SheetChromeHeader>
  );
}
