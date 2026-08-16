import { cache } from 'react';
import {
  composeDaoBranding,
  type DaoBranding,
} from '@/features/protocol/dao-branding';
import { getProtocolDaoConfig } from '@/features/protocol/protocol-eligibility';
import { loadProfileShell } from '@/lib/profile-shell';

export interface DaoPageData {
  branding: DaoBranding;
  configName: string | null;
  configPurpose: string | null;
  configMetadata: string;
}

/** SSR / shared loader for DAO portfolio pages. */
export const loadDaoPageData = cache(
  async (daoAccountId: string): Promise<DaoPageData | null> => {
    const id = daoAccountId.trim();
    if (!id) return null;

    const [profile, config] = await Promise.all([
      loadProfileShell(id).catch(() => null),
      getProtocolDaoConfig(id).catch(() => null),
    ]);

    // Require a reachable Sputnik config or an OnSocial profile shell.
    if (!config && !profile) return null;

    const branding = composeDaoBranding({
      daoAccountId: id,
      profile,
      config,
    });

    return {
      branding,
      configName: config?.name?.trim() || null,
      configPurpose: config?.purpose?.trim() || null,
      configMetadata: config?.metadata ?? '',
    };
  }
);
