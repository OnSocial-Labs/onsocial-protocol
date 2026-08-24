'use client';

import type { ReactNode } from 'react';
import {
  LauncherHomeEmpty,
  LauncherHomeError,
} from '@/components/launcher-home/launcher-home-empty';

/** Section chrome shared by mine + activity blocks on launcher Homes. */
export function LauncherHomeSection({
  title,
  'aria-label': ariaLabel,
  children,
}: {
  title?: string;
  'aria-label'?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="launcher-home-section"
      aria-label={ariaLabel ?? title}
    >
      {title ? <h2 className="launcher-home-heading">{title}</h2> : null}
      {children}
    </section>
  );
}

/**
 * Membership rail status: logged out → error → loading → empty → children (rail).
 * Keeps the three Homes on one state order without a shared data layer.
 */
export function LauncherHomeMineStatus({
  connected,
  loading,
  error,
  onRetry,
  emptyLoggedOut,
  emptyNone,
  loadingLabel,
  loadingSkeleton,
  hasItems,
  children,
}: {
  connected: boolean;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyLoggedOut: ReactNode;
  emptyNone: ReactNode;
  loadingLabel: ReactNode;
  /** Layout-accurate shimmer while membership loads. */
  loadingSkeleton?: ReactNode;
  hasItems: boolean;
  children: ReactNode;
}) {
  if (!connected) {
    return <LauncherHomeEmpty>{emptyLoggedOut}</LauncherHomeEmpty>;
  }
  if (error) {
    return onRetry ? (
      <LauncherHomeError message={error} onRetry={onRetry} />
    ) : (
      <LauncherHomeEmpty>{error}</LauncherHomeEmpty>
    );
  }
  if (loading) {
    if (loadingSkeleton) return <>{loadingSkeleton}</>;
    return <LauncherHomeEmpty>{loadingLabel}</LauncherHomeEmpty>;
  }
  if (!hasItems) {
    return <LauncherHomeEmpty>{emptyNone}</LauncherHomeEmpty>;
  }
  return <>{children}</>;
}
