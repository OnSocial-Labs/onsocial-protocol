import { normalizeProfileTags } from '@/lib/profile-display';

interface PortfolioTagsProps {
  tags?: unknown;
}

export function PortfolioTags({ tags }: PortfolioTagsProps) {
  const items = normalizeProfileTags(tags);

  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="portfolio-tags">
      {items.map((tag) => (
        <li key={tag} className="portfolio-tag">
          {tag}
        </li>
      ))}
    </ul>
  );
}
