'use client';

import { useEffect, useState } from 'react';
import type { EntityIdAvailability } from '@/hooks/use-entity-id-availability';
import {
  entityIdAvailabilityClass,
  entityIdAvailabilityLead,
} from '@/hooks/use-entity-id-availability';
import { isNearAccountInputReady } from '@/lib/app-near-account';

export {
  entityIdAvailabilityClass,
  entityIdAvailabilityLead,
  type EntityIdAvailability,
};

async function probeAccountExists(accountId: string): Promise<boolean> {
  const response = await fetch(
    `/api/account-exists?accountId=${encodeURIComponent(accountId)}`,
    { headers: { accept: 'application/json' } }
  );
  if (!response.ok) {
    throw new Error(`account-exists probe failed (${response.status})`);
  }
  const data = (await response.json()) as { exists?: unknown };
  return data.exists === true;
}

type ProbeState = {
  id: string;
  value: Exclude<EntityIdAvailability, 'idle'>;
};

/** Debounced NEAR account existence probe (taken = exists). */
export function useNearAccountAvailability(
  accountId: string
): EntityIdAvailability {
  const [probe, setProbe] = useState<ProbeState | null>(null);
  const trimmed = accountId.trim();
  const ready = isNearAccountInputReady(trimmed);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setProbe({ id: trimmed, value: 'checking' });
      void probeAccountExists(trimmed)
        .then((exists) => {
          if (!cancelled) {
            setProbe({
              id: trimmed,
              value: exists ? 'taken' : 'available',
            });
          }
        })
        .catch(() => {
          if (!cancelled) setProbe(null);
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, ready]);

  if (!ready) return 'idle';
  if (!probe || probe.id !== trimmed) return 'checking';
  return probe.value;
}
