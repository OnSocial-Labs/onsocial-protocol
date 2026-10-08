'use client';

import { Fragment, type ReactNode } from 'react';
import { PortfolioAboutLink } from '@/components/portfolio/portfolio-about-link';
import {
  PortfolioWritingAnchor,
  useShowPortfolioWritingLink,
} from '@/components/portfolio/portfolio-writing-link';

/** Face depth doors — one quiet line: About · Writing. */
export function PortfolioDepthLinks({
  accountId,
  showAbout = false,
}: {
  accountId: string;
  showAbout?: boolean;
}) {
  const showWriting = useShowPortfolioWritingLink(accountId);
  const slots: Array<{ key: string; node: ReactNode }> = [];

  if (showAbout) {
    slots.push({
      key: 'about',
      node: <PortfolioAboutLink accountId={accountId} />,
    });
  }
  if (showWriting) {
    slots.push({
      key: 'writing',
      node: <PortfolioWritingAnchor accountId={accountId} />,
    });
  }

  if (slots.length === 0) return null;

  return (
    <nav className="portfolio-depth-links" aria-label="More">
      {slots.map((slot, index) => (
        <Fragment key={slot.key}>
          {index > 0 ? <DepthSep /> : null}
          {slot.node}
        </Fragment>
      ))}
    </nav>
  );
}

function DepthSep() {
  return (
    <span className="portfolio-depth-sep" aria-hidden>
      ·
    </span>
  );
}
