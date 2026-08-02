'use client';

import { useEffect, useState } from 'react';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';

/**
 * Trait chips for a minted scarce — reads the token's NEP-177 `reference`
 * JSON (OpenSea-style `attributes`) and renders trait / value pairs. Renders
 * nothing for tokens without trait metadata, so it is safe to mount anywhere
 * a token is shown.
 */

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

interface TraitEntry {
  label: string;
  value: string;
}

interface TokenRecord {
  metadata?: { reference?: string | null } | null;
}

/** Parse OpenSea-style `attributes` (array of {trait_type, value}) or a flat map. */
function parseTraits(data: unknown): TraitEntry[] {
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  const attributes = record.attributes;
  const entries: TraitEntry[] = [];
  if (Array.isArray(attributes)) {
    for (const item of attributes) {
      if (!item || typeof item !== 'object') continue;
      const attr = item as Record<string, unknown>;
      const label =
        typeof attr.trait_type === 'string' ? attr.trait_type.trim() : '';
      const raw = attr.value;
      const value =
        typeof raw === 'string'
          ? raw.trim()
          : typeof raw === 'number'
            ? String(raw)
            : '';
      if (label && value) entries.push({ label, value });
    }
  } else if (attributes && typeof attributes === 'object') {
    for (const [label, raw] of Object.entries(
      attributes as Record<string, unknown>
    )) {
      const value =
        typeof raw === 'string'
          ? raw.trim()
          : typeof raw === 'number'
            ? String(raw)
            : '';
      if (label.trim() && value) entries.push({ label: label.trim(), value });
    }
  }
  return entries.slice(0, 24);
}

async function fetchTokenTraits(tokenId: string): Promise<TraitEntry[]> {
  const token = await viewNearContract<TokenRecord | null>(
    SCARCES_CONTRACT,
    'nft_token',
    { token_id: tokenId }
  );
  const referenceUrl = resolveScarceMediaUrl(token?.metadata?.reference);
  if (!referenceUrl) return [];
  const response = await fetch(referenceUrl, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return [];
  return parseTraits(await response.json());
}

export function ScarceTraits({ tokenId }: { tokenId?: string | null }) {
  // Keyed by token so a stale fetch never renders under another token.
  const [loaded, setLoaded] = useState<{
    id: string;
    entries: TraitEntry[];
  } | null>(null);

  useEffect(() => {
    const id = tokenId?.trim();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const entries = await fetchTokenTraits(id);
        if (!cancelled) setLoaded({ id, entries });
      } catch {
        // No traits — chips simply don't render.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  const traits =
    loaded && loaded.id === tokenId?.trim() ? loaded.entries : [];
  if (traits.length === 0) return null;

  return (
    <div className="scarce-traits" aria-label="Traits">
      {traits.map((trait) => (
        <span
          key={`${trait.label}:${trait.value}`}
          className="scarce-trait-chip"
        >
          <span className="scarce-trait-label">{trait.label}</span>
          <span className="scarce-trait-value">{trait.value}</span>
        </span>
      ))}
    </div>
  );
}
