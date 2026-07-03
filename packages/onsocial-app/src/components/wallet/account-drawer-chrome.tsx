'use client';

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { SheetCloseButton } from '@onsocial/ui';
import { StandingSheetSubjectAvatar } from '@/components/panels/standing-sheet-subject';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  accountDrawerPrimaryLabel,
  fallbackLabel,
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
    <div className="standing-sheet-header account-drawer-header">
      <div className="standing-sheet-subject-row account-drawer-subject-row">
        <Link
          href={portfolioPath(accountId)}
          className="standing-sheet-subject account-drawer-subject"
          aria-label={`${primaryLabel} portfolio`}
          onClick={onClose}
        >
          <StandingSheetSubjectAvatar
            avatarUrl={avatarUrl ?? null}
            fallbackInitial={fallbackLabel(accountId).charAt(0).toUpperCase()}
          />
          <span className="standing-sheet-subject-copy account-drawer-subject-copy">
            <span className="standing-sheet-subject-name account-drawer-subject-name">
              {primaryLabel}
            </span>
            <AccountDrawerHandleCopy accountId={accountId} />
          </span>
        </Link>
        <div className="standing-sheet-actions account-drawer-actions">
          <SheetCloseButton onClick={onClose} ariaLabel="Close" />
        </div>
      </div>
      <h2 id={titleId} className="sr-only">
        {srTitle}
      </h2>
    </div>
  );
}
