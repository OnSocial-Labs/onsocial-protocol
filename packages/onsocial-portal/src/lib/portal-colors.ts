export const portalColors = {
  blue: 'var(--portal-blue)',
  green: 'var(--portal-green)',
  purple: 'var(--portal-purple)',
  gold: 'var(--portal-gold)',
  amber: 'var(--portal-amber)',
  pink: 'var(--portal-pink)',
  neutral: 'var(--portal-neutral)',
  muted: 'hsl(var(--muted-foreground))',
  red: 'var(--portal-red)',
} as const;

export const portalFrameBorders = {
  blue: 'var(--portal-blue-frame-border)',
  green: 'var(--portal-green-frame-border)',
  purple: 'var(--portal-purple-frame-border)',
  gold: 'var(--portal-gold-frame-border)',
  amber: 'var(--portal-amber-frame-border)',
  pink: 'var(--portal-pink-frame-border)',
  neutral: 'var(--portal-neutral-frame-border)',
  red: 'var(--portal-red-frame-border)',
} as const;

export const portalFrameBackgrounds = {
  blue: 'var(--portal-blue-frame-bg)',
  green: 'var(--portal-green-frame-bg)',
  purple: 'var(--portal-purple-frame-bg)',
  gold: 'var(--portal-gold-frame-bg)',
  amber: 'var(--portal-amber-frame-bg)',
  pink: 'var(--portal-pink-frame-bg)',
  neutral: 'var(--portal-neutral-frame-bg)',
  red: 'var(--portal-red-frame-bg)',
} as const;

export const portalSurfaceClasses = {
  blue: 'portal-blue-surface',
  green: 'portal-green-surface',
  purple: 'portal-purple-surface',
  gold: 'portal-gold-surface',
  amber: 'portal-amber-surface',
  neutral: 'portal-neutral-surface',
  red: 'portal-red-surface',
} as const;

export const portalPanelClasses = {
  blue: 'portal-blue-panel',
  green: 'portal-green-panel',
  purple: 'portal-purple-panel',
  gold: 'portal-gold-panel',
  amber: 'portal-amber-panel',
  red: 'portal-red-panel',
} as const;

/** Badge / highlight accents (excludes secondary ink `muted`). */
export type PortalAccent = Exclude<keyof typeof portalColors, 'muted'>;

/** Secondary copy and graphite panel ink. */
export type PortalInkColor = 'muted' | 'neutral';
export type PortalSurfaceAccent = keyof typeof portalSurfaceClasses;
export type PortalPanelAccent = keyof typeof portalPanelClasses;

export function portalFrameStyle(accent: PortalAccent) {
  return {
    borderColor: portalFrameBorders[accent],
    backgroundColor: portalFrameBackgrounds[accent],
  };
}

export function portalSurfaceClass(accent: PortalSurfaceAccent) {
  return portalSurfaceClasses[accent];
}

export function portalPanelClass(accent: PortalPanelAccent) {
  return portalPanelClasses[accent];
}
