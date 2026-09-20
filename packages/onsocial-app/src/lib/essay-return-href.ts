/** Arrived at the face from an essay — dock leave is that article. */
export const PORTFOLIO_ESSAY_PARAM = 'essay';
/** Place the essay was open — feed overlay, writing article URL, … */
export const PORTFOLIO_ESSAY_FROM_PARAM = 'from';

export function parsePortfolioEssayParam(
  raw: string | null | undefined
): string | null {
  const value = (raw ?? '').trim();
  return value || null;
}

/** Same-origin app path only. Rejects protocol / protocol-relative. */
export function parsePortfolioEssayFromParam(
  raw: string | null | undefined
): string | null {
  const value = (raw ?? '').trim();
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  const noHash = value.split('#')[0] ?? '';
  if (!noHash.startsWith('/') || noHash.startsWith('//')) return null;
  return noHash;
}

/** Keep the essay return when hopping shelf ↔ article on Writing. */
export function essayReturnSearch(
  search?: string | URLSearchParams | null
): string {
  if (!search) return '';
  const src =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  const next = new URLSearchParams();
  const essay = parsePortfolioEssayParam(src.get(PORTFOLIO_ESSAY_PARAM));
  const from = parsePortfolioEssayFromParam(
    src.get(PORTFOLIO_ESSAY_FROM_PARAM)
  );
  if (essay) next.set(PORTFOLIO_ESSAY_PARAM, essay);
  if (from) next.set(PORTFOLIO_ESSAY_FROM_PARAM, from);
  return next.toString();
}

export function withEssayReturnSearch(
  href: string,
  search?: string | URLSearchParams | null
): string {
  const qs = essayReturnSearch(search);
  if (!qs) return href.split('?')[0] ?? href;
  const path = href.split('?')[0] ?? href;
  return `${path}?${qs}`;
}
