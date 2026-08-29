/**
 * Canonical protocol hues for TS consumers (mood presets, inline styles).
 * Keep aligned with `@onsocial/ui/protocol.css` (`--protocol-*`).
 */
export const PROTOCOL_COLORS = {
  /* TEMP trial: soft blue — matches soft NEAR green energy */
  blue: '#60a5fa',
  blueHover: '#93c5fd',
  /* TEMP trial: soft purple — matches soft NEAR green energy */
  purple: '#c084fc',
  /* NEAR Protocol green — keep with @onsocial/ui protocol.css */
  green: '#00ec97',
  greenHover: '#33f0ad',
  amber: '#fbbf24',
  pink: '#ec4899',
  red: '#f25c5c',
} as const;

export type ProtocolColorKey = keyof typeof PROTOCOL_COLORS;
