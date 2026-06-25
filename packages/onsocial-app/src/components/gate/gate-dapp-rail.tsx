'use client';

import { OsAppRail } from '@/components/os/os-app-rail';
import { gateOsApps } from '@/lib/os-apps';

export function GateDappRail() {
  return (
    <OsAppRail
      apps={gateOsApps()}
      ariaLabel="OnSocial dApps"
      className="gate-os-rail"
    />
  );
}
