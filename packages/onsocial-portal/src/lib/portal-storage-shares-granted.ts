import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  pickActiveShareGrantsForPool,
  uniqueShareGrantTargetIds,
  type ActiveStorageShareGrant,
} from '@/lib/user-storage-display';

export interface PortalStorageSharesGrantedResponse {
  grants: ActiveStorageShareGrant[];
}

export async function loadPortalStorageSharesGranted(
  poolOwnerId: string,
  opts: { includeTargetIds?: string[] } = {}
): Promise<PortalStorageSharesGrantedResponse> {
  const os = createPortalServerOnSocialClient();

  const events = await os.query.storage.sharesGranted(poolOwnerId, {
    limit: 100,
  });
  const targetIds = uniqueShareGrantTargetIds([
    ...events.map((event) => ({ targetId: event.targetId })),
    ...(opts.includeTargetIds ?? []).map((targetId) => ({ targetId })),
  ]);

  const sponsorships = await Promise.all(
    targetIds.map(async (accountId) => ({
      accountId,
      shared: (await os.storageAccount.sponsorshipReceived(accountId)) ?? null,
    }))
  );

  return {
    grants: pickActiveShareGrantsForPool(poolOwnerId, sponsorships),
  };
}
