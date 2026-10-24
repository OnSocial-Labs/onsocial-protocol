'use client';

import type { ReactNode } from 'react';

/**
 * One commerce face for Buy, Bid, and Sell.
 * Title, the person, one line of what it is, then the price.
 */
export function ScarceCommerceSummary({
  title,
  mark,
  story,
  parties,
  price,
}: {
  title: string;
  /** `#3` under the title. Omitted when this sheet is the drop, not one copy. */
  mark?: string | null;
  story?: ReactNode;
  parties?: ReactNode;
  price?: ReactNode;
}) {
  return (
    <div className="scarce-buy-summary">
      <div className="scarce-buy-identity">
        <p className="scarce-buy-title">{title}</p>
        {mark ? <p className="collection-edition-line">{mark}</p> : null}
        {parties ? <div className="scarce-buy-parties">{parties}</div> : null}
      </div>
      {story ? <div className="scarce-buy-story">{story}</div> : null}
      {price ? <div className="scarce-buy-price-block">{price}</div> : null}
    </div>
  );
}
