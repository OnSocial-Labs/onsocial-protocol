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
  /* TEMP trial: protocol green — keep with protocol.css */
  green: '#00d084',
  greenHover: '#00e5a0',
  amber: '#fbbf24',
  pink: '#ec4899',
  red: '#f87171',
} as const;

export type ProtocolColorKey = keyof typeof PROTOCOL_COLORS;
