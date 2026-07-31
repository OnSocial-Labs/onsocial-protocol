'use client';

import { useEffect, useState } from 'react';

export type EntityIdAvailability = 'idle' | 'checking' | 'available' | 'taken';

export type EntityIdKind = 'hub' | 'guild';

type ProbeState = {
  id: string;
  value: Exclude<EntityIdAvailability, 'idle'>;
};

/** Same-origin server probe — reliable from the browser create forms. */
export async function probeEntityIdTaken(
  kind: EntityIdKind,
  id: string
): Promise<boolean> {
  const response = await fetch(
    `/api/entity-id?kind=${kind}&id=${encodeURIComponent(id)}`,
    { headers: { accept: 'application/json' } }
  );
  if (!response.ok) {
    throw new Error(`entity-id probe failed (${response.status})`);
  }
  const data = (await response.json()) as { taken?: unknown };
  return data.taken === true;
}

/**
 * Debounced on-chain id probe. Short / empty ids stay `idle` (no probe).
 */
export function useEntityIdAvailability(
  kind: EntityIdKind,
  id: string,
  minLength: number
): EntityIdAvailability {
  const [probe, setProbe] = useState<ProbeState | null>(null);
  const trimmed = id.trim();
  const ready = trimmed.length >= minLength;

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setProbe({ id: trimmed, value: 'checking' });
      void probeEntityIdTaken(kind, trimmed)
        .then((taken) => {
          if (!cancelled) {
            setProbe({ id: trimmed, value: taken ? 'taken' : 'available' });
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
  }, [kind, trimmed, ready]);

  if (!ready) return 'idle';
  if (!probe || probe.id !== trimmed) return 'checking';
  return probe.value;
}

export function entityIdAvailabilityClass(
  status: EntityIdAvailability
): string | undefined {
  if (status === 'available') return 'is-available';
  if (status === 'taken') return 'is-taken';
  if (status === 'checking') return 'is-checking';
  return undefined;
}

/** Same helper line — swap the lead word only. */
export function entityIdAvailabilityLead(status: EntityIdAvailability): string {
  if (status === 'available') return 'Available';
  if (status === 'taken') return 'Taken';
  if (status === 'checking') return 'Checking';
  return 'Permanent';
}
