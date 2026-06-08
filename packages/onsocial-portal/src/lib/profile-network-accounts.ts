export type NetworkAccountKind = 'mutual' | 'incoming' | 'outgoing';

export interface NetworkAccount {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
  kind: NetworkAccountKind;
}

export interface NetworkAccountSource {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Build orbit accounts: mutuals first, then one-way incoming, then one-way outgoing.
 * Lists should already be sorted newest-first from the indexer.
 */
export function buildNetworkAccountsOrdered(
  mutual: NetworkAccountSource[],
  incoming: NetworkAccountSource[],
  outgoing: NetworkAccountSource[]
): NetworkAccount[] {
  const seen = new Set<string>();
  const result: NetworkAccount[] = [];

  const push = (account: NetworkAccountSource, kind: NetworkAccountKind) => {
    if (seen.has(account.accountId)) return;
    seen.add(account.accountId);
    result.push({
      accountId: account.accountId,
      name: account.name,
      avatarUrl: account.avatarUrl,
      kind,
    });
  };

  for (const account of mutual) push(account, 'mutual');
  for (const account of incoming) push(account, 'incoming');
  for (const account of outgoing) push(account, 'outgoing');

  return result;
}

/**
 * @deprecated Prefer {@link buildNetworkAccountsOrdered} with an explicit mutual list.
 */
export function buildNetworkAccounts(
  incoming: NetworkAccountSource[],
  outgoing: NetworkAccountSource[]
): NetworkAccount[] {
  const outgoingIds = new Set(outgoing.map((account) => account.accountId));
  const mutual: NetworkAccountSource[] = [];
  const incomingOnly: NetworkAccountSource[] = [];

  for (const account of incoming) {
    if (outgoingIds.has(account.accountId)) {
      mutual.push(account);
    } else {
      incomingOnly.push(account);
    }
  }

  return buildNetworkAccountsOrdered(mutual, incomingOnly, outgoing);
}

export function standingSummaryToNetworkSource(account: {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
}): NetworkAccountSource {
  return {
    accountId: account.accountId,
    name: account.name,
    avatarUrl: account.avatarUrl,
  };
}
