'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { PortalBadge } from '@/components/ui/portal-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatSocialCompact } from '@/lib/leaderboard';
import {
  TRANSPARENCY_PULSE_CONTAINER_CLASS,
  TRANSPARENCY_PULSE_STATS_CLASS,
  TRANSPARENCY_PULSE_SUPPLY_VALUE_ROW_CLASS,
  TRANSPARENCY_PULSE_VALUE_ROW_CLASS,
} from '@/features/transparency/transparency-page-column';
import {
  TRANSPARENCY_TOKEN_CONTRACT,
  TRANSPARENCY_TOKEN_EXPLORER_URL,
  TRANSPARENCY_TOKEN_HOLDERS_URL,
  TRANSPARENCY_TOKEN_SPECS,
} from '@/features/transparency/transparency-constants';
import { cn } from '@/lib/utils';

function PulseItem({
  label,
  href,
  value,
  valueClassName,
  loading,
  external = true,
  featured = false,
}: {
  label: string;
  href: string;
  value: string;
  valueClassName?: string;
  loading?: boolean;
  external?: boolean;
  featured?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col items-center text-center',
        featured ? 'w-full' : 'px-0.5'
      )}
    >
      <span className="portal-type-micro text-muted-foreground/70">{label}</span>
      <div
        className={
          featured
            ? TRANSPARENCY_PULSE_SUPPLY_VALUE_ROW_CLASS
            : TRANSPARENCY_PULSE_VALUE_ROW_CLASS
        }
      >
        {loading ? (
          <Skeleton
            className={cn(
              'rounded-full bg-foreground/[0.06]',
              featured ? 'h-6 w-28' : 'h-5 w-14'
            )}
          />
        ) : (
          <Link
            href={href}
            {...(external
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {})}
            className={cn(
              'max-w-full truncate font-mono font-semibold tabular-nums tracking-tight portal-link',
              featured
                ? 'text-base sm:text-lg'
                : 'text-xs sm:text-sm',
              valueClassName
            )}
          >
            {value}
          </Link>
        )}
      </div>
    </div>
  );
}

function TokenActionButton({
  children,
  className,
  ...props
}: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-background/50 text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function TokenIdentityHeader({
  tokenIconSrc,
  tokenSymbol,
  onTokenIconError,
}: {
  tokenIconSrc: string | null;
  tokenSymbol: string;
  onTokenIconError?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(TRANSPARENCY_TOKEN_CONTRACT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-[4.25rem]">
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/40 bg-background/50 p-0.5">
          {tokenIconSrc ? (
            <img
              src={tokenIconSrc}
              alt=""
              className="h-full w-full rounded-full object-cover"
              onError={onTokenIconError}
            />
          ) : (
            <PortalBadge
              accent="blue"
              size="icon"
              weight="semibold"
              className="h-6 w-6 portal-type-label"
            >
              {tokenSymbol.slice(0, 1)}
            </PortalBadge>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold tracking-tight text-foreground">
              {tokenSymbol}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <TokenActionButton
                onClick={handleCopy}
                title={copied ? 'Copied!' : 'Copy contract'}
                aria-label={copied ? 'Copied contract' : 'Copy contract'}
              >
                {copied ? (
                  <Check className="portal-green-icon h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </TokenActionButton>
              <a
                href={TRANSPARENCY_TOKEN_EXPLORER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-background/50 text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
                aria-label="Open token on explorer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            title={TRANSPARENCY_TOKEN_CONTRACT}
            className="mt-1 w-full truncate text-left font-mono text-[11px] leading-snug text-muted-foreground transition-colors hover:text-foreground sm:text-xs sm:whitespace-normal sm:break-all"
          >
            {TRANSPARENCY_TOKEN_CONTRACT}
          </button>
        </div>
      </div>

      <p className="mt-1.5 text-center portal-type-micro uppercase tracking-[0.14em] text-muted-foreground/70">
        {TRANSPARENCY_TOKEN_SPECS.join(' · ')}
      </p>
    </div>
  );
}

export function TransparencySupplyPulse({
  tokenIconSrc,
  tokenSymbol,
  onTokenIconError,
  supplyDisplay,
  burnedDisplay,
  holderCount,
  totalLockedYocto,
  supplyLoading = false,
  holdersLoading = false,
  lockedLoading = false,
  className,
}: {
  tokenIconSrc: string | null;
  tokenSymbol: string;
  onTokenIconError?: () => void;
  supplyDisplay: string | null;
  burnedDisplay: string | null;
  holderCount: number | null;
  totalLockedYocto: string;
  supplyLoading?: boolean;
  holdersLoading?: boolean;
  lockedLoading?: boolean;
  className?: string;
}) {
  const supply = supplyDisplay ?? '—';
  const burned = burnedDisplay ?? '—';
  const holders =
    holderCount === null ? '—' : holderCount.toLocaleString('en-US');
  const locked =
    totalLockedYocto === '0' ? '—' : formatSocialCompact(totalLockedYocto);

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/40 bg-background/30 px-3 py-2.5 sm:px-3.5',
        TRANSPARENCY_PULSE_CONTAINER_CLASS,
        className
      )}
    >
      <TokenIdentityHeader
        tokenIconSrc={tokenIconSrc}
        tokenSymbol={tokenSymbol}
        onTokenIconError={onTokenIconError}
      />

      <div className={TRANSPARENCY_PULSE_STATS_CLASS}>
        <PulseItem
          label="Supply"
          href={TRANSPARENCY_TOKEN_EXPLORER_URL}
          value={supply}
          loading={supplyLoading}
          featured
        />

        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2">
          <PulseItem
            label="Burned"
            href={TRANSPARENCY_TOKEN_EXPLORER_URL}
            value={burned}
            loading={supplyLoading}
          />
          <PulseItem
            label="Locked"
            href="/boost"
            value={locked}
            loading={lockedLoading}
            external={false}
          />
          <PulseItem
            label="Holders"
            href={TRANSPARENCY_TOKEN_HOLDERS_URL}
            value={holders}
            loading={holdersLoading}
          />
        </div>
      </div>
    </div>
  );
}
