/**
 * Canonical protocol hues for TS consumers (mood presets, inline styles).
 * Keep aligned with `@onsocial/ui/protocol.css` (`--protocol-*`).
 */
export const PROTOCOL_COLORS = {
  blue: '#60a5fa',
  blueHover: '#93c5fd',
  purple: '#c084fc',
  green: '#4ade80',
  amber: '#fbbf24',
  pink: '#ec4899',
  red: '#f87171',
} as const;

export type ProtocolColorKey = keyof typeof PROTOCOL_COLORS;
