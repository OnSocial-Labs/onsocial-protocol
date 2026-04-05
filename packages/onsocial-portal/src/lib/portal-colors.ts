export const portalColors = {
  blue: 'var(--portal-blue)',
  green: 'var(--portal-green)',
  purple: 'var(--portal-purple)',
  amber: 'var(--portal-amber)',
  pink: 'var(--portal-pink)',
  slate: 'var(--portal-slate)',
  red: 'var(--portal-red)',
} as const;

export const portalFrameBorders = {
  blue: 'var(--portal-blue-frame-border)',
  green: 'var(--portal-green-frame-border)',
  purple: 'var(--portal-purple-frame-border)',
  amber: 'var(--portal-amber-frame-border)',
  pink: 'var(--portal-pink-frame-border)',
  slate: 'var(--portal-slate-frame-border)',
  red: 'var(--portal-red-frame-border)',
} as const;

export const portalFrameBackgrounds = {
  blue: 'var(--portal-blue-frame-bg)',
  green: 'var(--portal-green-frame-bg)',
  purple: 'var(--portal-purple-frame-bg)',
  amber: 'var(--portal-amber-frame-bg)',
  pink: 'var(--portal-pink-frame-bg)',
  slate: 'var(--portal-slate-frame-bg)',
  red: 'var(--portal-red-frame-bg)',
} as const;

export const portalSurfaceClasses = {
  blue: 'portal-blue-surface',
  green: 'portal-green-surface',
  purple: 'portal-purple-surface',
  amber: 'portal-amber-surface',
  slate: 'portal-slate-surface',
  red: 'portal-red-surface',
} as const;

export const portalPanelClasses = {
  blue: 'portal-blue-panel',
  green: 'portal-green-panel',
  purple: 'portal-purple-panel',
  amber: 'portal-amber-panel',
  red: 'portal-red-panel',
} as const;

export type PortalAccent = keyof typeof portalColors;
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
