'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { Button } from '@/components/ui/button';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { useWallet } from '@/contexts/wallet-context';
import { SeasonZeroMetricsRail } from '@/features/season/season-zero-metrics-rail';
import type {
  SeasonZeroSettlementSummary,
  SeasonZeroStatusPayload,
} from '@/features/season/season-zero-types';
import {
  formatGenesisSeasonTimeRemaining,
  formatGenesisYoctoAsSocial,
} from '@/lib/genesis-season';
import { GOVERNANCE_WALLETS, isGovernanceWallet } from '@/lib/portal-config';
import {
  getActiveSeasonPresentation,
  getSeasonPresentation,
  seasonApiPath,
} from '@/lib/active-season';
import { useSeasonRegistry } from '@/lib/season-registry';

type AdminAction = 'finalize' | 'publish' | null;

interface FinalizePreviewRow {
  rank: number;
  accountId: string;
  score: number;
  eligible: boolean;
}

interface FinalizePreviewPayload {
  success?: boolean;
  stable?: boolean;
  participantCount?: number;
  indexedPoolAmountYocto?: string;
  onChainPoolAmountYocto?: string;
  distributablePoolAmountYocto?: string;
  standings?: FinalizePreviewRow[];
  error?: string;
}

function readEndsAtNs(endsAtNs: string | undefined): number {
  if (!endsAtNs) return 0;
  const parsed = Number(endsAtNs);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAdminError(error: string): { message: string; hint?: string } {
  if (error.includes('Season settlement admin key is not configured')) {
    return {
      message: 'Testnet backend is missing the settlement admin key.',
      hint: 'Redeploy testnet so SEASON_SETTLEMENT_ADMIN_KEY reaches the backend container, then retry.',
    };
  }
  if (
    error.includes(
      'SEASON_SETTLEMENT_ADMIN_KEY is not configured on the portal server'
    )
  ) {
    return {
      message: 'Portal server is missing the settlement admin key.',
      hint: 'Add SEASON_SETTLEMENT_ADMIN_KEY to .env.local and restart the dev server.',
    };
  }
  if (error.includes('Invalid admin key')) {
    return {
      message: 'Portal and backend admin keys do not match.',
      hint: 'Sync SEASON_SETTLEMENT_ADMIN_KEY from GSM on both portal and backend.',
    };
  }
  return { message: error };
}

function AdminStepCard({
  step,
  title,
  detail,
  actionLabel,
  disabled,
  loading,
  onAction,
  footnote,
}: {
  step: string;
  title: string;
  detail: string;
  actionLabel: string;
  disabled: boolean;
  loading: boolean;
  onAction: () => void;
  footnote?: string | null;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/25 p-3 sm:p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="portal-eyebrow text-muted-foreground">
            {step}
            <span className="text-muted-foreground/40"> · </span>
            <span className="text-muted-foreground/80">{title}</span>
          </p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground/80">
            {detail}
          </p>
        </div>
        <Button
          size="xs"
          disabled={disabled}
          loading={loading}
          onClick={onAction}
          className="shrink-0"
        >
          {actionLabel}
        </Button>
      </div>
      {footnote ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground/70">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}

export default function SeasonZeroAdminPage() {
  const { registry } = useSeasonRegistry();
  const seasonId =
    registry?.resolvedActiveSeasonId ??
    registry?.live?.seasonId ??
    'season-one';
  const activePresentation = getSeasonPresentation(
    seasonId,
    registry?.seasons.find((entry) => entry.seasonId === seasonId) ?? null
  );
  const { accountId, connect } = useWallet();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<SeasonZeroStatusPayload | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<AdminAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<FinalizePreviewPayload | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const settlement = status?.settlement ?? null;
  const onChain = status?.onChainConfig ?? null;
  const seasonEnded =
    onChain && !onChain.is_live && readEndsAtNs(onChain.ends_at_ns) > 0;
  const previewStable = preview?.stable === true;
  const canFinalize = Boolean(
    seasonEnded && !settlement && allowed && previewStable
  );
  const canPublish = Boolean(
    allowed && settlement && settlement.status !== 'published'
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const statusRes = await fetch(seasonApiPath(seasonId, 'status'), {
        cache: 'no-store',
      });
      const statusData = (await statusRes.json()) as SeasonZeroStatusPayload;
      if (statusRes.ok) setStatus(statusData);

      const onChain = statusRes.ok ? (statusData.onChainConfig ?? null) : null;
      const standingsCutoff =
        onChain && !onChain.is_live && onChain.ends_at_ns
          ? `&cutoff_timestamp_ns=${encodeURIComponent(onChain.ends_at_ns)}`
          : '';

      const [standingsRes, accessRes] = await Promise.all([
        fetch(
          `${seasonApiPath(seasonId, 'standings')}?limit=1${standingsCutoff}`,
          {
            cache: 'no-store',
          }
        ),
        accountId
          ? fetch(
              `/api/seasons/admin/access?account_id=${encodeURIComponent(accountId)}`,
              { cache: 'no-store' }
            )
          : Promise.resolve(null),
      ]);

      const standingsData = (await standingsRes.json()) as {
        success?: boolean;
        total?: number;
      };
      if (standingsRes.ok && standingsData.success !== false) {
        setParticipantCount(standingsData.total ?? 0);
      }

      let accessAllowed = false;
      if (accountId && accessRes) {
        const accessData = (await accessRes.json()) as {
          allowed?: boolean;
        };
        accessAllowed = Boolean(accessRes.ok && accessData.allowed);
        setAllowed(accessAllowed);
      } else {
        setAllowed(null);
      }

      const seasonEndedLocal =
        onChain && !onChain.is_live && readEndsAtNs(onChain.ends_at_ns) > 0;

      if (
        accessAllowed &&
        seasonEndedLocal &&
        !statusData.settlement &&
        accountId
      ) {
        setPreviewLoading(true);
        try {
          const cutoffQuery = onChain?.ends_at_ns
            ? `&cutoff_timestamp_ns=${encodeURIComponent(onChain.ends_at_ns)}`
            : '';
          const previewRes = await fetch(
            `/api/seasons/admin/preview?account_id=${encodeURIComponent(accountId)}${cutoffQuery}`,
            { cache: 'no-store' }
          );
          const previewData =
            (await previewRes.json()) as FinalizePreviewPayload;
          setPreview(previewRes.ok ? previewData : null);
        } catch {
          setPreview(null);
        } finally {
          setPreviewLoading(false);
        }
      } else {
        setPreview(null);
      }
    } catch {
      setActionError('Could not load season admin status.');
    } finally {
      setLoading(false);
    }
  }, [accountId, seasonId]);

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
            ? 'Settlement finalized in the backend.'
            : 'Merkle root published on-chain.'
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
    return GOVERNANCE_WALLETS.slice(0, 3);
  }, [allowed]);

  const formattedError = actionError ? formatAdminError(actionError) : null;

  const finalizeFootnote =
    !seasonEnded && onChain?.is_live
      ? `Opens when season ends${
          readEndsAtNs(onChain.ends_at_ns) > 0
            ? ` (${formatGenesisSeasonTimeRemaining(readEndsAtNs(onChain.ends_at_ns))})`
            : ''
        }.`
      : seasonEnded && !settlement && allowed && preview?.stable === false
        ? 'Standings still shifting — refresh until two reads match.'
        : seasonEnded && !settlement && allowed && previewLoading
          ? 'Checking standings stability…'
          : null;

  const publishFootnote = settlement?.publishedTxHash
    ? `Tx ${settlement.publishedTxHash}`
    : null;

  return (
    <PageShell size="section">
      <SecondaryPageHeader
        badge="Ops"
        badgeAccent="gold"
        glowAccents={['gold', 'blue']}
        title={`${seasonId} settlement`}
        description="Finalize standings, then publish the merkle root."
        titleClassName="text-3xl md:text-4xl"
        descriptionClassName="mt-2 text-sm md:text-base"
        contentClassName="max-w-3xl"
      />

      <div className="mx-auto max-w-3xl space-y-3">
        <Link
          href="/season"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-[var(--portal-blue)]"
        >
          <ArrowLeft className="h-3 w-3" />
          {activePresentation.pageTitle}
        </Link>

        {onChain ? (
          <SurfacePanel
            radius="xl"
            tone="solid"
            borderTone="strong"
            padding="none"
            className="overflow-hidden border-border/40"
          >
            <SeasonZeroMetricsRail
              onChainConfig={onChain}
              indexedPoolYocto={status?.indexedPoolYocto}
              joinPoolYocto={status?.joinPoolYocto}
              sponsoredPoolYocto={status?.sponsoredPoolYocto}
              settlement={settlement}
              participantCount={participantCount}
              showSettlementDetail
            />
          </SurfacePanel>
        ) : null}

        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="snug"
          className="space-y-3 border-border/40"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="portal-eyebrow text-muted-foreground">
              Settlement ops
              {allowed === true ? (
                <>
                  <span className="text-muted-foreground/40"> · </span>
                  <span className="text-[var(--portal-green)]">authorized</span>
                </>
              ) : allowed === false ? (
                <>
                  <span className="text-muted-foreground/40"> · </span>
                  <span className="text-[var(--portal-red)]">
                    not authorized
                  </span>
                </>
              ) : null}
            </p>
            <Button
              size="xs"
              variant="secondary"
              loading={loading}
              onClick={() => void refresh()}
              className="gap-1.5"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {!accountId ? (
              <Button size="xs" onClick={() => void connect()}>
                Connect admin wallet
              </Button>
            ) : (
              <span className="font-mono text-foreground/90">{accountId}</span>
            )}
            {settlement ? (
              <>
                <span className="text-muted-foreground/40">·</span>
                <PortalBadge accent="neutral" size="sm">
                  {settlement.status}
                </PortalBadge>
                <span className="text-muted-foreground/70">
                  {settlement.participantCount} in payout ·{' '}
                  {formatGenesisYoctoAsSocial(settlement.totalAmountYocto)}{' '}
                  SOCIAL
                </span>
              </>
            ) : (
              <span className="text-muted-foreground/70">
                No settlement snapshot yet
              </span>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <AdminStepCard
              step="1"
              title="Finalize"
              detail="Snapshot standings, build merkle tree, store claims."
              actionLabel="Finalize"
              disabled={!canFinalize}
              loading={action === 'finalize'}
              onAction={() => void runAction('finalize')}
              footnote={finalizeFootnote}
            />
            <AdminStepCard
              step="2"
              title="Publish"
              detail="Push merkle root on-chain so claims can open."
              actionLabel="Publish"
              disabled={!canPublish}
              loading={action === 'publish'}
              onAction={() => void runAction('publish')}
              footnote={publishFootnote}
            />
          </div>

          {seasonEnded && !settlement && allowed ? (
            <div className="rounded-xl border border-border/40 bg-background/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="portal-eyebrow text-muted-foreground">
                  Finalize preview
                  {preview?.stable === true ? (
                    <>
                      <span className="text-muted-foreground/40"> · </span>
                      <span className="text-[var(--portal-green)]">stable</span>
                    </>
                  ) : preview?.stable === false ? (
                    <>
                      <span className="text-muted-foreground/40"> · </span>
                      <span className="text-[var(--portal-red)]">unstable</span>
                    </>
                  ) : null}
                </p>
                {previewLoading ? (
                  <span className="text-[11px] text-muted-foreground/70">
                    Re-reading…
                  </span>
                ) : null}
              </div>
              {preview?.standings && preview.standings.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs">
                  {preview.standings.map((row) => (
                    <li
                      key={row.accountId}
                      className="flex items-center justify-between gap-2 font-mono text-foreground/90"
                    >
                      <span>
                        #{row.rank}{' '}
                        <span className="text-muted-foreground">
                          {row.accountId}
                        </span>
                      </span>
                      <span>
                        {row.score.toLocaleString()} pts
                        {!row.eligible ? (
                          <span className="ml-1 text-muted-foreground/70">
                            · ineligible
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground/75">
                  {previewLoading
                    ? 'Loading payout ranks…'
                    : 'Preview unavailable — refresh after connecting an admin wallet.'}
                </p>
              )}
              {preview?.indexedPoolAmountYocto ? (
                <p className="mt-2 text-[11px] text-muted-foreground/70">
                  Pool{' '}
                  {formatGenesisYoctoAsSocial(
                    preview.distributablePoolAmountYocto ??
                      preview.indexedPoolAmountYocto
                  )}{' '}
                  SOCIAL distributable
                  {preview.onChainPoolAmountYocto &&
                  preview.distributablePoolAmountYocto &&
                  preview.distributablePoolAmountYocto !==
                    preview.indexedPoolAmountYocto ? (
                    <>
                      {' '}
                      · indexed{' '}
                      {formatGenesisYoctoAsSocial(
                        preview.indexedPoolAmountYocto
                      )}{' '}
                      · on-chain{' '}
                      {formatGenesisYoctoAsSocial(
                        preview.onChainPoolAmountYocto
                      )}
                    </>
                  ) : null}{' '}
                  · {preview.participantCount ?? 0} participants · capped at
                  season end
                </p>
              ) : null}
            </div>
          ) : null}

          {actionSuccess ? (
            <p className="text-xs text-[var(--portal-green)]">
              {actionSuccess}
            </p>
          ) : null}

          {formattedError ? (
            <div className="rounded-lg border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs text-[var(--portal-red)]">
              <p className="flex items-start gap-1.5 font-medium">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {formattedError.message}
              </p>
              {formattedError.hint ? (
                <p className="mt-1 pl-5 text-[var(--portal-red)]/85">
                  {formattedError.hint}
                </p>
              ) : null}
            </div>
          ) : null}

          {allowed === false && accountId ? (
            <p className="text-[11px] leading-snug text-muted-foreground/75">
              Wallet not in{' '}
              <span className="font-mono text-muted-foreground">
                ADMIN_WALLETS
              </span>
              {adminHintWallets.length > 0
                ? ` — try ${adminHintWallets.join(', ')}`
                : ''}
              {isGovernanceWallet(accountId)
                ? ', or add your wallet to portal ADMIN_WALLETS.'
                : '.'}
            </p>
          ) : null}

          {!accountId ? (
            <p className="text-[11px] leading-snug text-muted-foreground/70">
              Requires a wallet in{' '}
              <span className="font-mono">ADMIN_WALLETS</span>. The portal
              forwards finalize/publish with a server-side key — never exposed
              to the browser.
            </p>
          ) : null}
        </SurfacePanel>
      </div>
    </PageShell>
  );
}
