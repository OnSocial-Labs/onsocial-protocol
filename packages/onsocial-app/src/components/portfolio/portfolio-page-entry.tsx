'use client';

import { ChevronUpIcon, OsIconAction } from '@onsocial/ui';

/** Opens the portfolio page drawer. Stays mounted while the drawer is open. */
export function PortfolioPageContentEntry({
  open,
  onOpen,
}: {
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <OsIconAction
      ariaLabel="Open page"
      aria-haspopup="dialog"
      aria-expanded={open}
      className="portfolio-page-chevron"
      onClick={onOpen}
    >
      <ChevronUpIcon aria-hidden />
    </OsIconAction>
  );
}
