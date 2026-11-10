'use client';

import { ChevronUpIcon, OsIconAction } from '@onsocial/ui';

/** Opens the portfolio page drawer. Stays mounted while the drawer is open. */
export function PortfolioPageContentEntry({
  open,
  concealed,
  onOpen,
}: {
  open: boolean;
  /** Hidden from keyboard and the accessibility tree while the sheet trap is up. */
  concealed: boolean;
  onOpen: () => void;
}) {
  return (
    <OsIconAction
      ariaLabel="Open page"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-hidden={concealed ? true : undefined}
      tabIndex={concealed ? -1 : undefined}
      className="portfolio-page-chevron"
      onClick={onOpen}
    >
      <ChevronUpIcon aria-hidden />
    </OsIconAction>
  );
}
