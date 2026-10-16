'use client';

import { useState } from 'react';
import type { OfferRecord } from '@onsocial/sdk';
import {
  Divider,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
} from '@onsocial/ui';
import { OfferAddedTime } from '@/components/portfolio/offer-added-time';
import { PortfolioBioBlocks } from '@/components/portfolio/portfolio-bio-blocks';
import { DmComposeSheet } from '@/features/messages/dm-compose-sheet';
import type { ResolvedMood } from '@/lib/moods/types';
import { profileBioPlainPreview } from '@/lib/profile-bio-rich';
import { SHEET_Z } from '@/lib/sheet-z';

function offerHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function OfferDetailSheet({
  open,
  onClose,
  onMessage,
  profileName,
  offer,
  zIndex,
}: {
  open: boolean;
  onClose: () => void;
  onMessage: () => void;
  profileName: string;
  offer: OfferRecord | null;
  zIndex: number;
}) {
  if (!offer) return null;
  const description = offer.description?.trim() || '';
  const url = offer.url?.trim() || '';

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label={offer.title}
      copy={profileName}
      titleAccessory={
        <OfferAddedTime since={offer.since} className="portfolio-offer-added" />
      }
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
              onClick={onMessage}
            >
              Message
            </OsSheetAction>
          </OsSheetActions>
        </OsSheetFooter>
      }
    >
      {description ? (
        <div className="portfolio-hiring-detail-copy">
          <PortfolioBioBlocks text={description} headingAs="p" />
        </div>
      ) : null}
      {url ? (
        <>
          <Divider
            variant="detail"
            className="portfolio-hiring-detail-divider"
          />
          <a
            className="portfolio-hiring-meta portfolio-hiring-detail-meta portfolio-offer-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {offerHost(url)}
          </a>
        </>
      ) : null}
    </OsHugSheet>
  );
}

/**
 * Visitor offer drawer. One offer opens on its title. Several open as a
 * list titled Offers, then the same detail. Message sits above that detail.
 */
export function PortfolioOffersSheet({
  open,
  onClose,
  offers,
  profileName,
  mood = null,
  accountId,
  zIndex = SHEET_Z.list,
}: {
  open: boolean;
  onClose: () => void;
  offers: OfferRecord[];
  profileName: string;
  mood?: ResolvedMood | null;
  accountId: string;
  zIndex?: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);

  if (!open && selectedId !== null) setSelectedId(null);
  if (!open && messageOpen) setMessageOpen(false);

  const single = offers.length === 1 ? offers[0]! : null;
  const selected =
    single ?? offers.find((offer) => offer.offerId === selectedId) ?? null;
  const show = open && !messageOpen;
  const listOpen = show && offers.length > 1;
  const detailOpen = show && selected != null;
  const detailZ = Math.max(zIndex + 2, SHEET_Z.nested);

  return (
    <>
      <OsHugSheet
        open={listOpen}
        onClose={() => {
          if (detailOpen) return;
          onClose();
        }}
        label="Offers"
        copy={profileName}
        closeAriaLabel="Close offers"
        backdropLabel="Close offers"
        zIndex={zIndex}
      >
        {offers.length === 0 ? (
          <p className="app-storage-meta">No offers yet.</p>
        ) : (
          <ul className="portfolio-hiring-list">
            {offers.map((offer, index) => (
              <li key={offer.offerId} className="portfolio-hiring-item">
                {index > 0 ? <Divider variant="item" /> : null}
                <button
                  type="button"
                  className="portfolio-hiring-row"
                  onClick={() => setSelectedId(offer.offerId)}
                >
                  <span className="portfolio-hiring-title-row">
                    <p className="portfolio-hiring-title">{offer.title}</p>
                    <OfferAddedTime since={offer.since} />
                  </span>
                  {offer.description ? (
                    <p className="portfolio-hiring-teaser">
                      {profileBioPlainPreview(offer.description, {
                        maxBlocks: 1,
                      })}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </OsHugSheet>
      <OfferDetailSheet
        open={detailOpen}
        onClose={() => {
          if (single) onClose();
          else setSelectedId(null);
        }}
        onMessage={() => setMessageOpen(true)}
        profileName={profileName}
        offer={selected}
        zIndex={detailZ}
      />
      <DmComposeSheet
        open={messageOpen}
        peerAccountId={accountId}
        peerName={profileName}
        mood={mood}
        zIndex={detailZ + 2}
        onClose={() => setMessageOpen(false)}
      />
    </>
  );
}
