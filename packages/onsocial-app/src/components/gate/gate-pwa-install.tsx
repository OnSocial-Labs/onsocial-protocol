'use client';

import { osCommitCancelClassName } from '@onsocial/ui';
import { usePwa } from '@/components/providers/pwa-provider';
import type { GateInstallPlatform } from '@/lib/gate-install-platform';

/**
 * Quiet text install under Let’s connect. The kit’s commit-cancel control
 * is the colourless, borderless text button. A matching reserve keeps the
 * slot’s height from the first paint. Standalone hides it in CSS before
 * paint (`display-mode` and `data-pwa-standalone`).
 */
export function GatePwaInstall({
  platform,
}: {
  platform: GateInstallPlatform;
}) {
  const { canInstall, install } = usePwa();
  const showIosHint = platform === 'ios' && !canInstall;

  return (
    <div className="gate-install-slot">
      <button
        type="button"
        className={`${osCommitCancelClassName} gate-install-reserve`}
        tabIndex={-1}
        aria-hidden
      >
        Install app
      </button>
      {canInstall ? (
        <button
          type="button"
          className={osCommitCancelClassName}
          onClick={() => {
            void install();
          }}
        >
          Install app
        </button>
      ) : showIosHint ? (
        <p className="gate-connect-install-hint">Share → Add to Home Screen</p>
      ) : null}
    </div>
  );
}
