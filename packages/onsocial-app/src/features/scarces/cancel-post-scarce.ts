import type { NearWalletBase } from '@hot-labs/near-connect';
import type { PostScarceEmbed, RelayResponse } from '@onsocial/sdk';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';

/** Whether the author can cancel/delist this embed from the post menu. */
export function canCancelPostScarce(embed: PostScarceEmbed | null): boolean {
  if (!embed) return false;
  if (embed.status === 'lazy_listing') return Boolean(embed.listingId);
  if (embed.status === 'listed') return Boolean(embed.tokenId);
  return false;
}

/** Cancel a lazy listing or delist a fixed-price sale (wallet → scarces). */
export async function cancelPostScarceListing(
  accountId: string,
  wallet: NearWalletBase,
  embed: PostScarceEmbed
): Promise<RelayResponse> {
  const client = createAppScarcesWalletClient(accountId, wallet);
  if (embed.status === 'lazy_listing' && embed.listingId) {
    return client.scarces.lazy.cancel(embed.listingId);
  }
  if (embed.status === 'listed' && embed.tokenId) {
    return client.scarces.market.delist(embed.tokenId);
  }
  throw new Error('No active listing to cancel.');
}
