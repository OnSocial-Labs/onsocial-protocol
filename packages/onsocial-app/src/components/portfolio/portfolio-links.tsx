import { PortfolioLinkIcon } from '@/components/portfolio/portfolio-link-icon';
import { resolvePortfolioSocialLinks } from '@/lib/profile-social-links';

interface PortfolioLinksProps {
  links?: unknown;
}

export function PortfolioLinks({ links }: PortfolioLinksProps) {
  const items = resolvePortfolioSocialLinks(links);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="portfolio-links-scroll">
      <ul className="portfolio-links">
        {items.map((item) => (
          <li key={item.key}>
            <a
              className="portfolio-link"
              data-link-kind={item.kind}
              href={item.href}
              rel="noopener noreferrer"
              target="_blank"
              aria-label={item.label}
            >
              <PortfolioLinkIcon kind={item.kind} className="portfolio-link-icon" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
