'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { TokenIcon } from '@onsocial/ui';
import {
  compactModalBodyClass,
  compactModalBodyDenseClass,
  compactModalHeaderDenseClass,
} from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { Sheet } from '@/components/ui/sheet';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { useWallet } from '@/contexts/wallet-context';
import { WalletBootstrapPlaceholder } from '@/components/ui/portal-connect-prompt';
import { formatNearCompact, formatSocialCompact } from '@/lib/leaderboard';
import { cn } from '@/lib/utils';

interface WalletAssetToken {
  symbol: string;
  name: string;
  icon: string | null;
  decimals: number;
}

interface WalletAssetsPayload {
  nearBalanceYocto?: string;
  socialBalanceYocto?: string;
  social?: WalletAssetToken;
  error?: string;
  detail?: string;
}

interface WalletAssetsModalProps {
  open: boolean;
  accountId: string | null;
  onOpenChange: (open: boolean) => void;
}

function AssetRow({
  token,
  balanceLabel,
  loading,
  error,
}: {
  token: WalletAssetToken;
  balanceLabel: string;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <TokenIcon
          src={token.icon}
          label={token.symbol}
          size="md"
          className="shrink-0"
        />
        <div className="min-w-0">
          <p className="truncate portal-type-body font-medium text-foreground">
            {token.symbol}
          </p>
          <p className="truncate portal-type-label text-muted-foreground/60">
            {token.name}
          </p>
        </div>
      </div>
      {loading ? (
        <PulsingDots size="sm" className="shrink-0" />
      ) : (
        <p
          className={cn(
            'shrink-0 font-mono text-sm font-semibold tabular-nums tracking-tight',
            error ? 'text-[var(--portal-amber)]' : 'text-portal-neutral'
          )}
        >
          {balanceLabel}
        </p>
      )}
    </div>
  );
}

function WalletAssetsModalBody({
  accountId,
  open,
}: {
  accountId: string;
  open: boolean;
}) {
  const requestIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nearBalanceYocto, setNearBalanceYocto] = useState('0');
  const [socialBalanceYocto, setSocialBalanceYocto] = useState('0');
  const [nearToken] = useState<WalletAssetToken>({
    symbol: 'NEAR',
    name: 'NEAR',
    icon: '/near.svg',
    decimals: 24,
  });
  const [socialToken, setSocialToken] = useState<WalletAssetToken>({
    symbol: 'SOCIAL',
    name: 'OnSocial',
    icon: null,
    decimals: 18,
  });
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;

    const requestId = ++requestIdRef.current;

    void fetch(
      `/api/wallet/assets?accountId=${encodeURIComponent(accountId)}`,
      { cache: 'no-store' }
    )
      .then(async (response) => {
        const payload = (await response
          .json()
          .catch(() => null)) as WalletAssetsPayload | null;

        if (requestId !== requestIdRef.current) return;

        if (!response.ok) {
          throw new Error(
            payload?.detail ?? payload?.error ?? `HTTP ${response.status}`
          );
        }

        setNearBalanceYocto(payload?.nearBalanceYocto ?? '0');
        setSocialBalanceYocto(payload?.socialBalanceYocto ?? '0');
        if (payload?.social) setSocialToken(payload.social);
        setHasLoaded(true);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Assets unavailable');
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      });
  }, [accountId, open]);

  const showLoading = loading && !hasLoaded;
  const nearLabel = error ? '—' : formatNearCompact(nearBalanceYocto);
  const socialLabel = error ? '—' : formatSocialCompact(socialBalanceYocto);

  return (
    <>
      <div className="divide-y divide-fade-item">
        <AssetRow
          token={nearToken}
          balanceLabel={nearLabel}
          loading={showLoading}
          error={error}
        />
        <AssetRow
          token={socialToken}
          balanceLabel={socialLabel}
          loading={showLoading}
          error={error}
        />
      </div>

      {error ? (
        <p className="mt-3 portal-type-label text-[var(--portal-amber)]">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function WalletAssetsModal({
  open,
  accountId,
  onOpenChange,
}: WalletAssetsModalProps) {
  const { isLoading: isWalletBootstrapping } = useWallet();
  const titleId = useId();

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      ariaLabelledby={titleId}
      dismissLabel="Close wallet assets"
    >
      <ModalHeader
        titleId={titleId}
        title="Assets"
        description={
          accountId
            ? `@${accountId} · Native NEAR & SOCIAL`
            : isWalletBootstrapping
              ? 'Checking wallet connection'
              : 'Connect a wallet to view balances'
        }
        descriptionVariant="meta"
        bordered
        className={compactModalHeaderDenseClass}
        actions={
          <ModalCloseButton
            ariaLabel="Close wallet assets"
            onClick={() => onOpenChange(false)}
          />
        }
      />

      <div className={cn(compactModalBodyClass, compactModalBodyDenseClass)}>
        {isWalletBootstrapping ? (
          <WalletBootstrapPlaceholder variant="inline" className="py-4" />
        ) : !accountId ? (
          <p className="py-4 text-center text-sm text-muted-foreground/65">
            Connect a wallet to view balances.
          </p>
        ) : (
          <WalletAssetsModalBody
            key={accountId}
            accountId={accountId}
            open={open}
          />
        )}
      </div>
    </Sheet>
  );
}
