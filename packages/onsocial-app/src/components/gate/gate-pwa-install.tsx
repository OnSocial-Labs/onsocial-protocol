'use client';

import { usePwa } from '@/components/providers/pwa-provider';

/** Gate secondary CTA — install when the browser offers it; iOS gets Share hint. */
export function GatePwaInstall() {
  const { canInstall, isInstalled, isIos, install } = usePwa();

  if (isInstalled) return null;

  if (canInstall) {
    return (
      <button
        type="button"
        className="gate-connect-button gate-connect-install"
        onClick={() => {
          void install();
        }}
      >
        Install app
      </button>
    );
  }

  if (isIos) {
    return (
      <p className="gate-connect-install-hint">Share → Add to Home Screen</p>
    );
  }

  return null;
}
