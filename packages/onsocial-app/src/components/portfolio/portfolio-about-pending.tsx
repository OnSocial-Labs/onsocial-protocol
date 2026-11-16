/** Cold About body — masthead and lede shimmer inside the settled article shell. */
export function PortfolioAboutPending() {
  return (
    <article
      className="portfolio-about portfolio-about-pending"
      data-has-type="true"
      aria-busy="true"
    >
      <div className="portfolio-about-spread">
        <div className="portfolio-about-type">
          <header className="portfolio-about-masthead">
            <span
              className="standing-row-shimmer portfolio-about-pending-name"
              aria-hidden
            />
            <span
              className="standing-row-shimmer portfolio-about-pending-rule"
              aria-hidden
            />
          </header>
          <div className="portfolio-about-essay portfolio-about-lede">
            <span
              className="standing-row-shimmer standing-row-shimmer-line"
              aria-hidden
            />
            <span
              className="standing-row-shimmer standing-row-shimmer-line-sm"
              aria-hidden
            />
          </div>
        </div>
      </div>
    </article>
  );
}