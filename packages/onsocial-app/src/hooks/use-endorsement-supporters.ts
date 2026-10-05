'use client';

import { useEffect, useState } from 'react';
import type { AppEndorsementSupporter } from '@/lib/app-endorsement-supporters';
import { fetchEndorsementSupporters } from '@/lib/endorsement-supporters-client';

type FetchedSupporters = {
  key: string;
  supporters: AppEndorsementSupporter[];
  error: string | null;
};

/**
 * Who put SOCIAL on one vouch. `supporters` stays null until the response for
 * the current id + refreshKey lands, so callers never render a stale list for
 * a different vouch.
 */
export function useEndorsementSupporters(
  endorsementId: string | null,
  { enabled, refreshKey = 0 }: { enabled: boolean; refreshKey?: number }
): { supporters: AppEndorsementSupporter[] | null; error: string | null } {
  const requestKey =
    enabled && endorsementId ? `${endorsementId}:${refreshKey}` : '';
  const [fetched, setFetched] = useState<FetchedSupporters | null>(null);

  useEffect(() => {
    if (!requestKey || !endorsementId) return;
    const key = requestKey;
    let cancelled = false;
    void fetchEndorsementSupporters(endorsementId)
      .then((supporters) => {
        if (cancelled) return;
        setFetched({ key, supporters, error: null });
      })
      .catch((cause) => {
        if (cancelled) return;
        setFetched({
          key,
          supporters: [],
          error:
            cause instanceof Error
              ? cause.message
              : 'Could not load supporters.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [endorsementId, requestKey]);

  const ready = fetched?.key === requestKey;
  return {
    supporters: ready ? fetched.supporters : null,
    error: ready ? fetched.error : null,
  };
}
