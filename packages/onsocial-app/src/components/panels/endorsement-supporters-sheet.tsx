'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Divider,
  OsHugSheet,
} from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { EndorsementListSkeleton } from '@/components/panels/endorsement-list-row';
import type { AppEndorsementSupporter } from '@/lib/app-endorsement-supporters';
import { formatEndorsementTime } from '@/lib/endorsement-display';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { portfolioPath } from '@/lib/overlay-routes';
import { SHEET_Z } from '@/lib/sheet-z';

interface EndorsementSupportersSheetProps {
  open: boolean;
  endorsementId: string | null;
  copy?: string | null;
  zIndex?: number;
  onOpenChange: (open: boolean) => void;
  refreshKey?: number;
}

async function fetchEndorsementSupporters(
  endorsementId: string
): Promise<AppEndorsementSupporter[]> {
  const params = new URLSearchParams({ endorsementId });
  const response = await fetch(`/api/endorsement/supporters?${params}`, {
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as {
    supporters?: AppEndorsementSupporter[];
    error?: string;
    detail?: string;
  } | null;
  if (!response.ok) {
    throw new Error(
      body?.detail ?? body?.error ?? 'Could not load supporters.'
    );
  }
  return body?.supporters ?? [];
}

/**
 * Who put SOCIAL on one vouch — hug list from the focus sheet.
 * Same shape as DAO Votes, not a standing overlay.
 */
export function EndorsementSupportersSheet({
  open,
  endorsementId,
  copy = null,
  zIndex = SHEET_Z.nested,
  onOpenChange,
  refreshKey = 0,
}: EndorsementSupportersSheetProps) {
  const [closing, setClosing] = useState(false);
  const requestKey =
    open && endorsementId ? `${endorsementId}:${refreshKey}` : '';
  const [fetched, setFetched] = useState<{
    key: string;
    supporters: AppEndorsementSupporter[];
    error: string | null;
  } | null>(null);
  const sheetOpen = open && !closing && Boolean(endorsementId);

  useEffect(() => {
    if (!open || !endorsementId) return;
    const key = `${endorsementId}:${refreshKey}`;
    let cancelled = false;
    void fetchEndorsementSupporters(endorsementId)
      .then((supporters) => {
        if (cancelled) return;
        setFetched({ key, supporters, error: null });
      })
      .catch((cause) => {
        if (cancelled) return;
        setFetched({
          key,
          supporters: [],
          error:
            cause instanceof Error
              ? cause.message
              : 'Could not load supporters.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [endorsementId, open, refreshKey]);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setFetched(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const ready = fetched?.key === requestKey;
  const supporters = ready ? fetched.supporters : null;
  const error = ready ? fetched.error : null;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Supporters"
      {...(copy ? { copy } : {})}
      closeAriaLabel="Close supporters"
      backdropLabel="Close supporters"
      zIndex={zIndex}
      initialDetent="peek"
      peekRatio={0.55}
      panelClassName="os-sheet-cap-standard"
      bodyClassName="endorsement-supporters-sheet-body"
    >
      {supporters == null ? (
        <EndorsementListSkeleton rows={3} />
      ) : error ? (
        <p className="endorsement-supporters-empty">{error}</p>
      ) : supporters.length === 0 ? (
        <p className="endorsement-supporters-empty">No supporters yet.</p>
      ) : (
        <div className="standing-list endorsement-supporters-list">
          {supporters.map((row, index) => {
            const time = formatEndorsementTime({
              blockTimestamp: row.latestSupportAt ?? 0,
              since: 0,
            });
            const amount = formatSocialCompact(row.totalAmountYocto);
            return (
              <div key={row.accountId}>
                {index > 0 ? <Divider variant="item" /> : null}
                <div className="standing-row endorsement-supporter-row">
                  <Link
                    href={portfolioPath(row.accountId)}
                    className="standing-row-main"
                    scroll={false}
                  >
                    <StandingIdentity
                      accountId={row.accountId}
                      profileName={row.name}
                      avatarUrl={row.avatarUrl}
                    />
                  </Link>
                  <div className="standing-row-aside">
                    {time ? (
                      <span className="standing-row-time">{time}</span>
                    ) : null}
                    <span className="endorsement-supporters-amount">
                      {amount} SOCIAL
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </OsHugSheet>
  );
}
