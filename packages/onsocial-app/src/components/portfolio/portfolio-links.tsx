import { normalizeLink } from '@/lib/profile-display';

interface PortfolioLinksProps {
  links?: Array<{ label: string; url: string }>;
}

export function PortfolioLinks({ links }: PortfolioLinksProps) {
  const items = (links ?? []).flatMap((link) => {
    const href = normalizeLink(link.url);
    const label = link.label?.trim();

    if (!href || !label) {
      return [];
    }

    return [{ href, label }];
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="portfolio-section">
      <h2 className="portfolio-section-title">Links</h2>
      <ul className="portfolio-links">
        {items.map((item) => (
          <li key={`${item.label}:${item.href}`}>
            <a
              className="portfolio-link"
              href={item.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
