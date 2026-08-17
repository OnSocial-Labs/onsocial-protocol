'use client';

import { Fragment } from 'react';
import { InformationCircleIcon } from '@onsocial/ui';

/**
 * Quiet mint/list meta row — same middot + centered ⓘ pattern as Drop hub meta.
 */
export function ScarceBuyFactsMeta({
  parts,
  onOpenFacts,
}: {
  parts: string[];
  onOpenFacts: () => void;
}) {
  const labels = parts.map((part) => part.trim()).filter(Boolean);
  return (
    <p className="profile-support-hint scarce-buy-meta-row">
      {labels.map((part, index) => (
        <Fragment key={`${index}:${part}`}>
          {index > 0 ? (
            <span className="scarce-buy-meta-sep" aria-hidden />
          ) : null}
          <span className="scarce-buy-meta-label">{part}</span>
        </Fragment>
      ))}
      <span className="scarce-buy-meta-sep" aria-hidden />
      <button
        type="button"
        className="guild-hero-facts-button collectibles-play-facts scarce-buy-facts-button"
        aria-label="Scarce facts"
        onClick={onOpenFacts}
      >
        <InformationCircleIcon
          className="guild-hero-facts-icon"
          aria-hidden
        />
      </button>
    </p>
  );
}
