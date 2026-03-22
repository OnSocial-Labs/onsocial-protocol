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

export const portalSurfaceBackgrounds = {
  blue: 'var(--portal-blue-bg)',
  green: 'var(--portal-green-bg)',
  purple: 'var(--portal-purple-bg)',
  amber: 'var(--portal-amber-bg)',
  pink: 'var(--portal-pink-bg)',
  slate: 'var(--portal-slate-bg)',
  red: 'var(--portal-red-bg)',
} as const;

export const portalSurfaceClasses = {
  blue: 'portal-blue-surface',
  green: 'portal-green-surface',
  purple: 'portal-purple-surface',
  amber: 'portal-amber-surface',
  pink: '',
  slate: '',
  red: 'portal-red-surface',
} as const;

export const portalPanelClasses = {
  blue: 'portal-blue-panel',
  green: 'portal-green-panel',
  purple: 'portal-purple-panel',
  amber: 'portal-amber-panel',
  pink: '',
  slate: '',
  red: 'portal-red-panel',
} as const;

export type PortalAccent = keyof typeof portalColors;

export function portalFrameStyle(accent: PortalAccent) {
  return {
    borderColor: portalFrameBorders[accent],
    backgroundColor: portalFrameBackgrounds[accent],
  };
}

export function portalBadgeStyle(accent: PortalAccent) {
  return {
    borderColor: portalFrameBorders[accent],
    backgroundColor: portalSurfaceBackgrounds[accent],
    color: portalColors[accent],
  };
}

export function portalSurfaceClass(accent: PortalAccent) {
  return portalSurfaceClasses[accent];
}

export function portalPanelClass(accent: PortalAccent) {
  return portalPanelClasses[accent];
}