'use client';

import type { ReactNode } from 'react';

/**
 * One commerce face for Buy, Bid, and Sell.
 * Title, the About line, the people, then the price.
 */
export function ScarceCommerceSummary({
  title,
  story,
  parties,
  price,
}: {
  title: string;
  story?: ReactNode;
  parties?: ReactNode;
  price?: ReactNode;
}) {
  return (
    <div className="scarce-buy-summary">
      <div className="scarce-buy-story">
        <p className="scarce-buy-title">{title}</p>
        {story}
      </div>
      {parties ? <div className="scarce-buy-parties">{parties}</div> : null}
      {price ? <div className="scarce-buy-price-block">{price}</div> : null}
    </div>
  );
}
