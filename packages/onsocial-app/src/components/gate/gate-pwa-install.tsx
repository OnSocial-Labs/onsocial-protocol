'use client';

import { OsSheetAction } from '@onsocial/ui';
import { usePwa } from '@/components/providers/pwa-provider';
import type { GateInstallPlatform } from '@/lib/gate-install-platform';

/**
 * Secondary install control under Let’s connect.
 * The reserve button is in the first paint so the iOS hint and the
 * Chromium prompt fill the same box. Standalone hides the slot in CSS
 * before paint (`display-mode` and `data-pwa-standalone`).
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
      <OsSheetAction
        variant="ghost"
        className="gate-install-reserve"
        tabIndex={-1}
        aria-hidden
      >
        Install app
      </OsSheetAction>
      {canInstall ? (
        <OsSheetAction
          variant="ghost"
          onClick={() => {
            void install();
          }}
        >
          Install app
        </OsSheetAction>
      ) : showIosHint ? (
        <p className="gate-connect-install-hint">Share → Add to Home Screen</p>
      ) : null}
    </div>
  );
}
