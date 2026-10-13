'use client';

import { useState } from 'react';
import type { OfferRecord } from '@onsocial/sdk';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
} from '@onsocial/ui';
import { DmComposeSheet } from '@/features/messages/dm-compose-sheet';
import type { ResolvedMood } from '@/lib/moods/types';
import { SHEET_Z } from '@/lib/sheet-z';

function offerHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function PortfolioOfferSheet({
  open,
  onClose,
  offer,
  profileName,
  mood = null,
  accountId,
  zIndex = SHEET_Z.gesture,
}: {
  open: boolean;
  onClose: () => void;
  offer: OfferRecord | null;
  profileName: string;
  mood?: ResolvedMood | null;
  accountId: string;
  zIndex?: number;
}) {
  const [messageOpen, setMessageOpen] = useState(false);
  if (!offer) return null;
  const line = offer.line?.trim() || '';
  const url = offer.url?.trim() || '';

  return (
    <>
      <OsHugSheet
        open={open && !messageOpen}
        onClose={onClose}
        label={offer.title}
        copy={profileName}
        closeAriaLabel="Close offer"
        backdropLabel="Close offer"
        zIndex={zIndex}
        footer={
          <OsSheetFooter>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready
                onClick={() => setMessageOpen(true)}
              >
                Message
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        }
      >
        {line ? <p className="portfolio-offer-line">{line}</p> : null}
        {url ? (
          <a
            className="portfolio-offer-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {offerHost(url)}
          </a>
        ) : null}
      </OsHugSheet>
      <DmComposeSheet
        open={messageOpen}
        peerAccountId={accountId}
        peerName={profileName}
        mood={mood}
        zIndex={Math.max(zIndex + 2, SHEET_Z.nested)}
        onClose={() => setMessageOpen(false)}
      />
    </>
  );
}
