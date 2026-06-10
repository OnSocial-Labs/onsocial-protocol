interface PortfolioTagsProps {
  tags?: string[];
}

export function PortfolioTags({ tags }: PortfolioTagsProps) {
  const items = (tags ?? []).map((tag) => tag.trim()).filter(Boolean);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="portfolio-section">
      <h2 className="portfolio-section-title">Tags</h2>
      <ul className="portfolio-tags">
        {items.map((tag) => (
          <li key={tag} className="portfolio-tag">
            {tag}
          </li>
        ))}
      </ul>
    </section>
  );
}
