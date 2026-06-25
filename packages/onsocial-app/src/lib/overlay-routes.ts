export const OVERLAY_PANELS = [
  'endorsements',
  'feed',
  'standing',
  'reputation',
] as const;

export type OverlayPanel = (typeof OVERLAY_PANELS)[number];

export function portfolioPath(accountId: string): string {
  return `/@${encodeURIComponent(accountId)}`;
}

export function overlayPath(accountId: string, panel: OverlayPanel): string {
  return `${portfolioPath(accountId)}/${panel}`;
}

export const OVERLAY_PANEL_LABELS: Record<OverlayPanel, string> = {
  endorsements: 'Endorsements',
  feed: 'Feed',
  standing: 'Standing',
  reputation: 'Reputation',
};

export function panelLabel(panel: OverlayPanel): string {
  return OVERLAY_PANEL_LABELS[panel];
}
