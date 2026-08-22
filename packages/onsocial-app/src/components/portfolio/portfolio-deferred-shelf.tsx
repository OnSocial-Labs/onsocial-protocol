import {
  fetchProfileCreatedPeeks,
  fetchProfilePostPeeks,
} from '@/lib/fetch-profile-peeks';
import { fetchProfileHoldingsPeeks } from '@/lib/fetch-profile-holdings';
import { fetchProfileStoreShelf } from '@/lib/fetch-profile-store';
import { PortfolioDeferredShelfHydrator } from '@/components/portfolio/portfolio-deferred-shelf-hydrator';

/** Stream below-fold drawer peeks after the portfolio hero paints. */
export async function PortfolioDeferredShelf({
  accountId,
}: {
  accountId: string;
}) {
  const [postPeeks, createdPeeks, storeShelf, holdings] = await Promise.all([
    fetchProfilePostPeeks(accountId),
    fetchProfileCreatedPeeks(accountId),
    fetchProfileStoreShelf(accountId),
    fetchProfileHoldingsPeeks(accountId),
  ]);

  return (
    <PortfolioDeferredShelfHydrator
      postPeeks={postPeeks}
      createdPeeks={createdPeeks}
      storeShelf={storeShelf}
      holdings={holdings}
    />
  );
}
