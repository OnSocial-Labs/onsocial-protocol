// ---------------------------------------------------------------------------
// Pure helpers shared by scarces action builders.
//   • No I/O, no HTTP, no StorageProvider — safe to import from any layer.
//   • Output JSON shapes are wire-compatible with the on-chain
//     `scarces-onsocial` contract's action enum.
// ---------------------------------------------------------------------------

export interface TokenMetadata {
  title: string;
  description?: string;
  media?: string;
  media_hash?: string;
  copies?: number;
  extra?: string;
  reference?: string;
  reference_hash?: string;
}

export function nearToYocto(near: string): string {
  const parts = near.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(24, '0').slice(0, 24);
  return (
    BigInt(whole) * BigInt('1000000000000000000000000') + BigInt(frac) + ''
  );
}

export function parseOptionalU64(
  value: string | undefined
): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return parsed;
}

export function buildTokenMetadata(opts: {
  title: string;
  description?: string;
  mediaCid?: string;
  mediaHash?: string;
  copies?: number;
  extra?: Record<string, unknown>;
}): TokenMetadata {
  return {
    title: opts.title,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.mediaCid ? { media: `ipfs://${opts.mediaCid}` } : {}),
    ...(opts.mediaHash ? { media_hash: opts.mediaHash } : {}),
    ...(opts.copies != null ? { copies: opts.copies } : {}),
    ...(opts.extra ? { extra: JSON.stringify(opts.extra) } : {}),
  };
}
