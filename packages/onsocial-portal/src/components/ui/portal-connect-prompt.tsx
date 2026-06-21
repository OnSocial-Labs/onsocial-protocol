'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWalletReady } from '@/hooks/use-wallet-ready';
import {
  PORTAL_CONNECT_NAV_HINT,
  portalConnectCtaLabel,
  portalConnectMessage,
  type PortalConnectAction,
} from '@/lib/portal-connect-copy';
import { cn } from '@/lib/utils';

type PortalConnectPromptProps = {
  action: PortalConnectAction;
  /** inline — copy under a section; gate — centered empty state; action — copy + contextual CTA */
  variant?: 'inline' | 'gate' | 'action';
  message?: string;
  showNavHint?: boolean;
  onConnect?: () => void;
  className?: string;
  icon?: ReactNode;
};

export function WalletBootstrapPlaceholder({
  className,
  variant = 'gate',
}: {
  className?: string;
  variant?: 'gate' | 'inline';
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Checking wallet connection"
      className={cn(
        variant === 'gate'
          ? 'flex flex-col items-center gap-3 py-6'
          : 'space-y-2 py-2',
        className
      )}
    >
      <Skeleton className="h-6 w-6 rounded-full bg-foreground/[0.06]" />
      <Skeleton className="h-4 w-[min(100%,12rem)] rounded-full bg-foreground/[0.05]" />
      {variant === 'gate' ? (
        <Skeleton className="mt-1 h-9 w-28 rounded-full bg-foreground/[0.06]" />
      ) : null}
    </div>
  );
}

export function PortalConnectPrompt({
  action,
  variant = 'inline',
  message,
  showNavHint,
  onConnect,
  className,
  icon,
}: PortalConnectPromptProps) {
  const { isWalletBootstrapping, isConnected } = useWalletReady();

  if (isWalletBootstrapping) {
    return (
      <WalletBootstrapPlaceholder
        className={className}
        variant={variant === 'inline' ? 'inline' : 'gate'}
      />
    );
  }

  if (isConnected && variant !== 'inline') {
    return null;
  }

  const copy = message ?? portalConnectMessage(action);
  const navHint =
    showNavHint ?? (variant === 'inline' || variant === 'gate');

  if (variant === 'gate') {
    return (
      <div className={cn('text-center', className)}>
        {icon ? <div className="mb-3 flex justify-center">{icon}</div> : null}
        <p className="text-sm text-muted-foreground">{copy}</p>
        {navHint ? (
          <p className="mt-2 portal-type-caption text-muted-foreground/70">
            {PORTAL_CONNECT_NAV_HINT}
          </p>
        ) : null}
        {onConnect ? (
          <Button
            type="button"
            className="mt-4 font-semibold"
            onClick={onConnect}
          >
            {portalConnectCtaLabel(action)}
          </Button>
        ) : null}
      </div>
    );
  }

  if (variant === 'action') {
    return (
      <div className={className}>
        <p className="text-sm text-muted-foreground">{copy}</p>
        {navHint ? (
          <p className="mt-1 portal-type-caption text-muted-foreground/70">
            {PORTAL_CONNECT_NAV_HINT}
          </p>
        ) : null}
        {onConnect ? (
          <Button
            type="button"
            className="mt-3 h-11 w-full sm:w-auto"
            onClick={onConnect}
          >
            {portalConnectCtaLabel(action)}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-sm text-muted-foreground">{copy}</p>
      {navHint ? (
        <p className="mt-1 portal-type-caption text-muted-foreground/70">
          {PORTAL_CONNECT_NAV_HINT}
        </p>
      ) : null}
    </div>
  );
}
