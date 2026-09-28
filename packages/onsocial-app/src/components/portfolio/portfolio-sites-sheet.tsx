'use client';

import { Divider, OsHugSheet } from '@onsocial/ui';
import { PortfolioLinkIcon } from '@/components/portfolio/portfolio-link-icon';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  portfolioLinkKindFromHref,
  portfolioWebsiteRowCopy,
  type PortfolioSocialLink,
} from '@/lib/profile-social-links';

/** Hug drawer of websites. One Mage link icon on the face opens this. */
export function PortfolioSitesSheet({
  open,
  websites,
  onClose,
}: {
  open: boolean;
  websites: PortfolioSocialLink[];
  onClose: () => void;
}) {
  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label="Links"
      closeAriaLabel="Close links"
      backdropLabel="Close links"
      zIndex={SHEET_Z.list}
      panelClassName="os-sheet-cap-standard"
      bodyClassName="portfolio-sites-sheet-body"
    >
      <div className="portfolio-sites-list">
        {websites.map((site, index) => {
          const copy = portfolioWebsiteRowCopy(site);
          const kind = portfolioLinkKindFromHref(site.href);
          return (
            <div key={site.key}>
              {index > 0 ? <Divider variant="item" /> : null}
              <a
                className="portfolio-sites-row"
                href={site.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="portfolio-sites-mark" aria-hidden>
                  <PortfolioLinkIcon
                    kind={kind}
                    className="portfolio-link-icon"
                  />
                </span>
                <span className="portfolio-sites-copy">
                  <span className="portfolio-sites-name">{copy.title}</span>
                  {copy.detail ? (
                    <span className="portfolio-sites-line">{copy.detail}</span>
                  ) : null}
                </span>
              </a>
            </div>
          );
        })}
      </div>
    </OsHugSheet>
  );
}
