/**
 * Home opens Writing by landing on the profile face, then continuing to the
 * shelf. That face must not paint: the article stays up until the list covers it.
 */

const STYLE_ID = 'portfolio-shelf-hop';

/** Unlayered so it wins over the portfolio canvas in `@layer components`. */
const HOP_CSS = `
html[data-shelf-hop] .portfolio-frame {
  background: transparent !important;
}
html[data-shelf-hop] .portfolio-frame > .portfolio-page {
  visibility: hidden !important;
}
`;

let active = false;
let leftHome = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function paintDocument() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(STYLE_ID);
  if (active) {
    document.documentElement.dataset.shelfHop = '';
    if (!existing) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = HOP_CSS;
      document.head.appendChild(style);
    }
    return;
  }
  delete document.documentElement.dataset.shelfHop;
  existing?.remove();
}

export function beginPortfolioShelfHop() {
  active = true;
  leftHome = false;
  paintDocument();
  emit();
}

export function endPortfolioShelfHop() {
  if (!active) return;
  active = false;
  leftHome = false;
  paintDocument();
  emit();
}

export function markShelfHopLeftHome() {
  if (active) leftHome = true;
}

export function hasShelfHopLeftHome() {
  return leftHome;
}

export function isPortfolioShelfHop() {
  return active;
}

export function subscribePortfolioShelfHop(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
