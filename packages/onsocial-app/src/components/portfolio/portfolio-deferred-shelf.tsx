import {
  fetchProfileCreatedPeeks,
  fetchProfilePostPeeks,
} from '@/lib/fetch-profile-peeks';
import { fetchProfileStoreShelf } from '@/lib/fetch-profile-store';
import { PortfolioDeferredShelfHydrator } from '@/components/portfolio/portfolio-deferred-shelf-hydrator';

/** Stream below-fold drawer peeks after the portfolio hero paints. */
export async function PortfolioDeferredShelf({
  accountId,
}: {
  accountId: string;
}) {
  const [postPeeks, createdPeeks, storeShelf] = await Promise.all([
    fetchProfilePostPeeks(accountId),
    fetchProfileCreatedPeeks(accountId),
    fetchProfileStoreShelf(accountId),
  ]);

  return (
    <PortfolioDeferredShelfHydrator
      postPeeks={postPeeks}
      createdPeeks={createdPeeks}
      storeShelf={storeShelf}
    />
  );
}
