import { cache } from 'react';
import type { JobSearchRow, OfferRecord } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

/** Standing offers for the face meta line. Empty when the account has none. */
export const loadPortfolioFaceOffers = cache(
  async (accountId: string): Promise<OfferRecord[]> => {
    try {
      const os = createServerOnSocialClient();
      return await os.offers.list(accountId);
    } catch {
      return [];
    }
  }
);

/** Open roles for an org meta line. Person and DAO faces do not call this. */
export const loadPortfolioFaceJobs = cache(
  async (accountId: string): Promise<JobSearchRow[]> => {
    try {
      const os = createServerOnSocialClient();
      return await os.query.jobs.forAccount(accountId);
    } catch {
      return [];
    }
  }
);
