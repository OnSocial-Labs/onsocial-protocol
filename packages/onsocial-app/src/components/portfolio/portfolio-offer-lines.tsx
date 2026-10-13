'use client';

import { useEffect, useState } from 'react';
import type { OfferRecord } from '@onsocial/sdk';
import { PortfolioOfferSheet } from '@/components/portfolio/portfolio-offer-sheet';
import type { ResolvedMood } from '@/lib/moods/types';
import { OFFERS_CHANGED_EVENT, fetchAccountOffers } from '@/lib/profile-offers';

/** Standing offer titles under location. Message lives on the offer sheet. */
export function PortfolioOfferLines({
  accountId,
  profileName,
  mood = null,
}: {
  accountId: string;
  profileName: string;
  mood?: ResolvedMood | null;
}) {
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

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

  const open = offers.find((offer) => offer.offerId === openId) ?? null;
  if (offers.length === 0) return null;

  return (
    <>
      <div className="portfolio-offer-lines">
        {offers.map((offer) => (
          <button
            key={offer.offerId}
            type="button"
            className="portfolio-location portfolio-offer"
            aria-haspopup="dialog"
            aria-expanded={openId === offer.offerId}
            aria-label={offer.title}
            onClick={() => setOpenId(offer.offerId)}
          >
            <span>{offer.title}</span>
          </button>
        ))}
      </div>
      <PortfolioOfferSheet
        open={open != null}
        onClose={() => setOpenId(null)}
        offer={open}
        profileName={profileName}
        mood={mood}
        accountId={accountId}
      />
    </>
  );
}
