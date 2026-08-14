/** Soft protocol tints for missing-avatar placeholders (not status colors). */
export const PROTOCOL_ACCOUNT_HUES = [
  'blue',
  'green',
  'amber',
  'purple',
  'pink',
] as const;

export type ProtocolAccountHue = (typeof PROTOCOL_ACCOUNT_HUES)[number];

/** Stable hash → protocol-safe hue for avatar wash. */
export function protocolAccountHue(accountId: string): ProtocolAccountHue {
  const id = accountId.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PROTOCOL_ACCOUNT_HUES[hash % PROTOCOL_ACCOUNT_HUES.length]!;
}
