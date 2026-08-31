'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { EndorsementFocusSheet } from '@/components/panels/endorsement-focus-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import {
  clearPortfolioEndorsementFocus,
} from '@/lib/endorsement-focus';
import type { EndorsementPanelItem } from '@/lib/endorsements-panel-data';
import type { ResolvedMood } from '@/lib/moods/types';
import { parsePortfolioEndorsementFocus } from '@/lib/overlay-routes';
import { SHEET_Z } from '@/lib/sheet-z';
import { txToastError } from '@/lib/transaction-toast-copy';

interface PortfolioEndorsementFocusHostProps {
  accountId: string;
  mood?: ResolvedMood | null;
}

async function fetchEndorsementFocus(
  accountId: string,
  focus: { id: string | null; issuer: string | null; topic: string | null }
): Promise<EndorsementPanelItem | null> {
  const params = new URLSearchParams({ accountId });
  if (focus.id) params.set('endorsement', focus.id);
  if (focus.issuer) params.set('issuer', focus.issuer);
  if (focus.topic) params.set('topic', focus.topic);
  const response = await fetch(`/api/profile/endorsements?${params}`, {
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as {
    item?: EndorsementPanelItem | null;
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? 'Could not load endorsement.');
  }
  return body?.item ?? null;
}

function PortfolioEndorsementFocusHostInner({
  accountId,
  mood = null,
}: PortfolioEndorsementFocusHostProps) {
  const searchParams = useSearchParams();
  const { setTxResult } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<EndorsementPanelItem | null>(null);
  const requestId = useRef(0);
  const focusKey = searchParams.toString();

  useEffect(() => {
    const focus = parsePortfolioEndorsementFocus(searchParams);
    if (!focus) {
      queueMicrotask(() => {
        setOpen(false);
        setItem(null);
      });
      return;
    }

    const id = ++requestId.current;
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchEndorsementFocus(accountId, focus);
        if (cancelled || id !== requestId.current) return;
        if (!next) {
          setTxResult({
            type: 'error',
            msg: txToastError.endorsementMissing,
          });
          clearPortfolioEndorsementFocus(accountId);
          setOpen(false);
          setItem(null);
          return;
        }
        setItem(next);
        setOpen(true);
      } catch {
        if (cancelled || id !== requestId.current) return;
        setTxResult({
          type: 'error',
          msg: txToastError.endorsementMissing,
        });
        clearPortfolioEndorsementFocus(accountId);
        setOpen(false);
        setItem(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, focusKey, searchParams, setTxResult]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) return;
      setItem(null);
      clearPortfolioEndorsementFocus(accountId);
    },
    [accountId]
  );

  const handleSuccess = useCallback(() => {
    const focus = parsePortfolioEndorsementFocus(searchParams);
    if (!focus) return;
    void fetchEndorsementFocus(accountId, focus).then((next) => {
      if (next) setItem(next);
    });
  }, [accountId, searchParams]);

  return (
    <EndorsementFocusSheet
      open={open}
      item={item}
      pageAccountId={accountId}
      mood={mood}
      zIndex={SHEET_Z.gesture}
      onOpenChange={handleOpenChange}
      onSuccess={handleSuccess}
    />
  );
}

/** Face host — `/@alice?endorsement=` opens the vouch sheet. Skip on DAO faces. */
export function PortfolioEndorsementFocusHost(
  props: PortfolioEndorsementFocusHostProps
) {
  return (
    <Suspense fallback={null}>
      <PortfolioEndorsementFocusHostInner {...props} />
    </Suspense>
  );
}
