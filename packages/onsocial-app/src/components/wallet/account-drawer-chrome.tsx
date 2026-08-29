'use client';

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { OsChromeSubject, osChromeSubjectClassName } from '@onsocial/ui';
import { SheetChromeHeader } from '@/components/panels/sheet-chrome-header';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  accountDrawerPrimaryLabel,
} from '@/lib/profile-display';

function AccountDrawerHandleCopy({ accountId }: { accountId: string }) {
  const [copied, setCopied] = useState(false);
  const handleLabel = `@${accountId}`;

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
      className={`account-drawer-handle-button${copied ? ' is-copied' : ''}`}
      onClick={handleCopy}
      title={accountId}
      aria-label={copied ? 'Address copied' : `Copy ${handleLabel}`}
    >
      {copied ? 'Copied' : handleLabel}
    </button>
  );
}

/** Identity row — tappable subject + full account id copy. */
export function AccountDrawerChrome({
  titleId,
  srTitle,
  onClose,
  accountId,
  profileName,
  avatarUrl,
}: {
  titleId: string;
  srTitle: string;
  onClose: () => void;
  accountId: string;
  profileName?: string;
  avatarUrl?: string | null;
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
          primaryLabel={primaryLabel}
          showHandle
          handleSlot={<AccountDrawerHandleCopy accountId={accountId} />}
          unstyled
        />
      </Link>
    </SheetChromeHeader>
  );
}
