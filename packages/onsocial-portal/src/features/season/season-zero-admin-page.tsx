'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Shield } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { Button } from '@/components/ui/button';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { useWallet } from '@/contexts/wallet-context';
import { SeasonZeroPhasePanel } from '@/features/season/season-zero-phase-panel';
import type {
  SeasonZeroSettlementSummary,
  SeasonZeroStatusPayload,
} from '@/features/season/season-zero-types';
import {
  formatGenesisSeasonTimeRemaining,
  formatGenesisYoctoAsSocial,
} from '@/lib/genesis-season';
import { GOVERNANCE_WALLETS, isGovernanceWallet } from '@/lib/portal-config';

type AdminAction = 'finalize' | 'publish' | null;

function readEndsAtNs(endsAtNs: string | undefined): number {
  if (!endsAtNs) return 0;
  const parsed = Number(endsAtNs);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function SeasonZeroAdminPage() {
  const { accountId, connect } = useWallet();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<SeasonZeroStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<AdminAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const settlement = status?.settlement ?? null;
  const onChain = status?.onChainConfig ?? null;
  const seasonEnded =
    onChain && !onChain.is_live && readEndsAtNs(onChain.ends_at_ns) > 0;
  const canFinalize = Boolean(seasonEnded && !settlement && allowed);
  const canPublish = Boolean(
    allowed && settlement && settlement.status !== 'published'
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const requests: Promise<Response>[] = [
        fetch('/api/seasons/season-zero/status', { cache: 'no-store' }),
      ];
      if (accountId) {
        requests.push(
          fetch(
            `/api/seasons/admin/access?account_id=${encodeURIComponent(accountId)}`,
            { cache: 'no-store' }
          )
        );
      }

      const [statusRes, accessRes] = await Promise.all(requests);
      const statusData = (await statusRes.json()) as SeasonZeroStatusPayload;
      if (statusRes.ok) setStatus(statusData);

      if (accountId && accessRes) {
        const accessData = (await accessRes.json()) as {
          allowed?: boolean;
        };
        setAllowed(Boolean(accessRes.ok && accessData.allowed));
      } else {
        setAllowed(null);
      }
    } catch {
      setActionError('Could not load season admin status.');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (kind: Exclude<AdminAction, null>) => {
      if (!accountId || !allowed) return;
      setAction(kind);
      setActionError(null);
      setActionSuccess(null);

      const path =
        kind === 'finalize'
          ? '/api/seasons/admin/finalize'
          : '/api/seasons/admin/publish';

      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            ...(kind === 'publish' ? { active: true } : {}),
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
          settlement?: SeasonZeroSettlementSummary;
        } | null;

        if (!res.ok || data?.success === false) {
          throw new Error(data?.error ?? `Request failed (${res.status})`);
        }

        setActionSuccess(
          kind === 'finalize'
            ? 'Season 0 settlement finalized in the backend.'
            : 'Season 0 merkle root published on-chain.'
        );
        await refresh();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Admin action failed.'
        );
      } finally {
        setAction(null);
      }
    },
    [accountId, allowed, refresh]
  );

  const adminHintWallets = useMemo(() => {
    if (allowed) return [];
    return GOVERNANCE_WALLETS.slice(0, 4);
  }, [allowed]);

  return (
    <PageShell size="section">
      <SecondaryPageHeader
        badge="Ops"
        badgeAccent="gold"
        glowAccents={['gold', 'blue']}
        title="Season 0 settlement"
        description="Finalize scores after the season ends, then publish the merkle root so participants can claim."
      />

      <div className="mx-auto max-w-4xl space-y-4">
        <SurfacePanel radius="xl" tone="soft">
          <div className="flex items-start gap-3">
            <Shield className="portal-gold-icon mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">Who can run this?</p>
              <p className="text-muted-foreground">
                Wallets listed in server env{' '}
                <span className="font-mono text-foreground">ADMIN_WALLETS</span>{' '}
                (from GSM on deploy). Local dev falls back to governance ops
                wallets when unset. The portal holds{' '}
                <span className="font-mono text-foreground">
                  SEASON_SETTLEMENT_ADMIN_KEY
                </span>{' '}
                server-side and forwards finalize/publish to the backend — the
                key is never sent to the browser.
              </p>
              {!accountId ? (
                <Button size="sm" onClick={() => void connect()}>
                  Connect admin wallet
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Connected as{' '}
                  <span className="font-mono text-foreground">{accountId}</span>
                  {allowed === true ? (
                    <>
                      {' '}
                      ·{' '}
                      <span className="text-[var(--portal-green)]">
                        authorized
                      </span>
                    </>
                  ) : allowed === false ? (
                    <>
                      {' '}
                      ·{' '}
                      <span className="text-[var(--portal-red)]">
                        not authorized
                      </span>
                    </>
                  ) : null}
                </p>
              )}
            </div>
          </div>
        </SurfacePanel>

        <SeasonZeroPhasePanel
          onChainConfig={onChain}
          indexedPoolYocto={status?.indexedPoolYocto}
          settlement={settlement}
        />

        <SurfacePanel radius="xl" tone="soft" className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Actions</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Run in order after the on-chain end time: finalize, then
                publish.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-9"
              loading={loading}
              onClick={() => void refresh()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/40 bg-background/30 p-4">
              <p className="text-sm font-medium text-foreground">1. Finalize</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Freeze standings at season end, build merkle tree, store claims
                in the backend database.
              </p>
              <Button
                size="sm"
                className="mt-3"
                disabled={!canFinalize}
                loading={action === 'finalize'}
                onClick={() => void runAction('finalize')}
              >
                Finalize Season 0
              </Button>
              {!seasonEnded && onChain?.is_live ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Available when season ends
                  {readEndsAtNs(onChain.ends_at_ns) > 0
                    ? ` (${formatGenesisSeasonTimeRemaining(readEndsAtNs(onChain.ends_at_ns))})`
                    : ''}
                  .
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-border/40 bg-background/30 p-4">
              <p className="text-sm font-medium text-foreground">2. Publish</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Push the merkle root to the social-spend contract via relayer so
                claims can open.
              </p>
              <Button
                size="sm"
                className="mt-3"
                disabled={!canPublish}
                loading={action === 'publish'}
                onClick={() => void runAction('publish')}
              >
                Publish on-chain
              </Button>
              {settlement?.publishedTxHash ? (
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  Published tx: {settlement.publishedTxHash}
                </p>
              ) : null}
            </div>
          </div>

          {settlement ? (
            <div className="rounded-xl border border-border/40 px-4 py-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <PortalBadge accent="neutral" size="sm">
                  {settlement.status}
                </PortalBadge>
                <span>
                  {settlement.participantCount} participants ·{' '}
                  {formatGenesisYoctoAsSocial(settlement.totalAmountYocto)}{' '}
                  SOCIAL allocated
                </span>
              </div>
            </div>
          ) : null}

          {actionSuccess ? (
            <p className="text-sm text-[var(--portal-green)]">
              {actionSuccess}
            </p>
          ) : null}
          {actionError ? (
            <p className="flex items-start gap-2 text-sm text-[var(--portal-red)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {actionError}
            </p>
          ) : null}

          {allowed === false && accountId ? (
            <p className="text-xs text-muted-foreground">
              This wallet is not in{' '}
              <span className="font-mono">ADMIN_WALLETS</span>. Try one of the
              configured ops wallets
              {adminHintWallets.length > 0
                ? ` (e.g. ${adminHintWallets.join(', ')})`
                : ''}
              {isGovernanceWallet(accountId)
                ? ', or add ADMIN_WALLETS to the portal server env.'
                : '.'}
            </p>
          ) : null}
        </SurfacePanel>

        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/season-zero"
            className="text-[var(--portal-blue)] hover:underline"
          >
            Back to Genesis Rally standings
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
