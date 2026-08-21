'use client';

import { useEffect, useState } from 'react';
import {
  isNearAccountInputReady,
  normalizeNearAccountId,
} from '@/lib/app-near-account';

export type NearAccountStatus =
  | 'idle'
  | 'invalid'
  | 'checking'
  | 'found'
  | 'missing';

type Phase =
  | { kind: 'checking'; id: string }
  | { kind: 'settled'; id: string; status: 'found' | 'missing' | 'invalid' };

const SETTLE_MS = 420;

/** Same-origin server probe — reliable from browser transfer forms. */
export async function probeNearAccountExists(
  accountId: string
): Promise<boolean> {
  const response = await fetch(
    `/api/account-exists?accountId=${encodeURIComponent(accountId)}`,
    { headers: { accept: 'application/json' } }
  );
  if (!response.ok) {
    throw new Error(`account-exists probe failed (${response.status})`);
  }
  const data = (await response.json()) as {
    exists?: unknown;
    uncertain?: unknown;
  };
  if (data.uncertain === true) {
    throw new Error('Could not verify account');
  }
  return data.exists === true;
}

/**
 * Debounced on-chain account probe.
 * Stays `idle` while typing; only settles after a pause so the field lip
 * does not flash mid-keystroke or flicker on confirm.
 */
export function useNearAccountStatus(accountId: string): NearAccountStatus {
  const [phase, setPhase] = useState<Phase | null>(null);
  const trimmed = accountId.trim();
  const normalized = normalizeNearAccountId(trimmed);
  const ready = isNearAccountInputReady(trimmed);

  useEffect(() => {
    if (!trimmed) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;

      if (!ready) {
        setPhase({ kind: 'settled', id: normalized, status: 'invalid' });
        return;
      }

      setPhase({ kind: 'checking', id: normalized });
      void probeNearAccountExists(normalized)
        .then((exists) => {
          if (cancelled) return;
          setPhase({
            kind: 'settled',
            id: normalized,
            status: exists ? 'found' : 'missing',
          });
        })
        .catch(() => {
          if (!cancelled) setPhase(null);
        });
    }, SETTLE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalized, ready, trimmed]);

  if (!trimmed) return 'idle';

  if (
    phase &&
    phase.id === normalized &&
    phase.kind === 'settled' &&
    ((!ready && phase.status === 'invalid') ||
      (ready && (phase.status === 'found' || phase.status === 'missing')))
  ) {
    return phase.status;
  }

  if (phase?.kind === 'checking' && phase.id === normalized && ready) {
    return 'checking';
  }

  // Typing / debounce window — no lip yet.
  return 'idle';
}

/**
 * Lip tint only after a complete id settles on-chain.
 * Incomplete / invalid typing stays untinted (no mid-keystroke red).
 */
export function nearAccountStatusClass(
  status: NearAccountStatus
): string | undefined {
  if (status === 'found') return 'is-available';
  if (status === 'missing') return 'is-taken';
  return undefined;
}
