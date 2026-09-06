import {
  isCollectionMintable,
  type CollectionStatus,
} from '@/features/scarces/collections-data';

/** Live public mint, or allowlist early mint. */
export function dropsShopMintable(opts: {
  status: CollectionStatus | null;
  hasAllowlist: boolean;
  allowlistRemaining?: number | null;
}): boolean {
  if (opts.status != null && isCollectionMintable(opts.status)) return true;
  return (
    opts.status === 'upcoming' &&
    opts.hasAllowlist &&
    opts.allowlistRemaining != null &&
    opts.allowlistRemaining > 0
  );
}

/** House list door — Collect when you can take an edition, else Open. */
export function dropsShopActionLabel(mintable: boolean): 'Collect' | 'Open' {
  return mintable ? 'Collect' : 'Open';
}
