'use client';

import { useState } from 'react';
import { PortfolioLinkIcon } from '@/components/portfolio/portfolio-link-icon';
import { PortfolioSitesSheet } from '@/components/portfolio/portfolio-sites-sheet';
import {
  portfolioLinkTitle,
  resolvePortfolioFaceLinks,
} from '@/lib/profile-social-links';

interface PortfolioLinksProps {
  links?: unknown;
  notes?: Record<string, string> | null;
  lines?: Record<string, string> | null;
}

export function PortfolioLinks({ links, notes, lines }: PortfolioLinksProps) {
  const face = resolvePortfolioFaceLinks(links, notes, lines);
  const [open, setOpen] = useState(false);

  if (face.icons.length === 0 && face.websites.length === 0) {
    return null;
  }

  return (
    <div className="portfolio-links-scroll">
      <ul className="portfolio-links" data-portfolio-link-mode={face.mode}>
        {face.mode === 'drawer' ? (
          <li>
            <button
              type="button"
              className="portfolio-link"
              aria-label="Links"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <PortfolioLinkIcon
                kind="custom"
                className="portfolio-link-icon"
              />
            </button>
          </li>
        ) : null}
        {face.icons.map((item) => (
          <li key={item.key}>
            <a
              className="portfolio-link"
              data-link-kind={item.kind}
              href={item.href}
              rel="noopener noreferrer"
              target="_blank"
              aria-label={portfolioLinkTitle(item)}
            >
              <PortfolioLinkIcon
                kind={item.kind}
                className="portfolio-link-icon"
              />
            </a>
          </li>
        ))}
      </ul>
      {face.mode === 'drawer' && open ? (
        <PortfolioSitesSheet
          open={open}
          websites={face.websites}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
