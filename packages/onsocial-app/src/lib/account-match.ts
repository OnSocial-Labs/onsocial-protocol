export type NearAccountNetwork = 'testnet' | 'mainnet';

function activeNearNetwork(): NearAccountNetwork {
  return process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
}

/** Canonical account id for comparisons (lowercase, implicit suffix on bare names). */
export function canonicalAccountId(
  accountId: string,
  network: NearAccountNetwork = activeNearNetwork()
): string {
  const id = accountId.trim().toLowerCase();
  if (id.endsWith('.testnet') || id.endsWith('.near')) {
    return id;
  }

  return network === 'testnet' ? `${id}.testnet` : `${id}.near`;
}

export function accountIdsEqual(
  left: string,
  right: string,
  network: NearAccountNetwork = activeNearNetwork()
): boolean {
  return canonicalAccountId(left, network) === canonicalAccountId(right, network);
}
