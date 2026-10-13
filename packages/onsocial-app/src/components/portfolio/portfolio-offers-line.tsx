'use client';

import { useEffect, useState } from 'react';
import {
  offerLineAriaLabel,
  offerLineLabel,
  type OfferRecord,
  type ProfileKind,
} from '@onsocial/sdk';
import { PortfolioLocationMark } from '@/components/portfolio/portfolio-location-mark';
import { PortfolioOffersSheet } from '@/components/portfolio/portfolio-offer-sheet';
import { ProfileOffersEditor } from '@/components/profile/profile-offers-editor';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import type { ResolvedMood } from '@/lib/moods/types';
import { OFFERS_CHANGED_EVENT, fetchAccountOffers } from '@/lib/profile-offers';
import { SHEET_Z } from '@/lib/sheet-z';

/**
 * Standing offers on the meta line the face already has.
 * Visitors open the offer drawer. The owner opens the editor.
 */
export function PortfolioOffersLine({
  accountId,
  profileName,
  mood = null,
  locationLabel = null,
  kind = 'person',
  variant = 'person',
  leadingSep = false,
}: {
  accountId: string;
  profileName: string;
  mood?: ResolvedMood | null;
  /** Person row keeps location on this same line. */
  locationLabel?: string | null;
  kind?: ProfileKind | null;
  /** `inline` — · Offers inside an existing org meta row. */
  variant?: 'person' | 'inline';
  leadingSep?: boolean;
}) {
  const { accountId: viewerId, isConnected } = useAppWallet();
  const isOwner =
    isConnected && Boolean(viewerId) && accountIdsEqual(viewerId!, accountId);
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const place = locationLabel?.trim() || null;

  if (!open && previewOpen) setPreviewOpen(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAccountOffers(accountId, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setOffers(next);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [accountId]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (detail?.accountId && detail.accountId !== accountId) return;
      void fetchAccountOffers(accountId).then(setOffers);
    };
    window.addEventListener(OFFERS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(OFFERS_CHANGED_EVENT, onChange);
  }, [accountId]);

  const drawers = (
    <>
      {isOwner ? (
        <>
          <ProfileOffersEditor
            accountId={accountId}
            kind={kind}
            sheetOnly
            open={open}
            onOpenChange={setOpen}
            onPreviewVisitors={
              offers.length > 0 ? () => setPreviewOpen(true) : undefined
            }
          />
          <PortfolioOffersSheet
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            offers={offers}
            profileName={profileName}
            mood={mood}
            accountId={accountId}
            zIndex={SHEET_Z.overlayNested}
          />
        </>
      ) : (
        <PortfolioOffersSheet
          open={open}
          onClose={() => setOpen(false)}
          offers={offers}
          profileName={profileName}
          mood={mood}
          accountId={accountId}
        />
      )}
    </>
  );

  if (offers.length === 0) {
    if (variant === 'inline' || !place) return null;
    return (
      <p className="portfolio-location">
        <PortfolioLocationMark />
        <span>{place}</span>
      </p>
    );
  }

  const word = (
    <>
      {variant === 'inline' && leadingSep ? (
        <span className="portfolio-org-meta-sep" aria-hidden>
          ·
        </span>
      ) : null}
      {variant === 'person' && place ? (
        <span className="portfolio-org-meta-sep" aria-hidden>
          ·
        </span>
      ) : null}
      <button
        type="button"
        className="portfolio-org-meta-offers"
        aria-haspopup="dialog"
        aria-expanded={open || previewOpen}
        aria-label={offerLineAriaLabel(offers.length)}
        onClick={() => setOpen(true)}
      >
        {offerLineLabel(offers.length)}
      </button>
    </>
  );

  if (variant === 'inline') {
    return (
      <>
        {word}
        {drawers}
      </>
    );
  }

  return (
    <>
      <p className="portfolio-location">
        {place ? (
          <>
            <PortfolioLocationMark />
            <span>{place}</span>
          </>
        ) : null}
        {word}
      </p>
      {drawers}
    </>
  );
}
