export type PortalConnectAction =
  | 'governance.viewPosition'
  | 'governance.create'
  | 'governance.policy'
  | 'governance.manage'
  | 'governance.vote'
  | 'governance.delegate'
  | 'partners.apply'
  | 'onapi.manage'
  | 'season.claim'
  | 'season.join'
  | 'boost'
  | 'endorse'
  | 'support'
  | 'swap'
  | 'generic';

const CONNECT_MESSAGES: Record<PortalConnectAction, string> = {
  'governance.viewPosition': 'Connect to view your balances and delegations.',
  'governance.create': 'Connect to check if you can propose.',
  'governance.policy': 'Connect to submit a policy change.',
  'governance.manage': 'Connect to manage your governance position.',
  'governance.vote': 'Connect to vote on this proposal.',
  'governance.delegate': 'Connect to delegate SOCIAL.',
  'partners.apply': 'Connect to start your partner application.',
  'onapi.manage': 'Connect to manage your API access.',
  'season.claim': 'Connect to check your season payout.',
  'season.join': 'Connect to join the rally.',
  boost: 'Connect to lock SOCIAL and grow your influence.',
  endorse: 'Connect to endorse.',
  support: 'Connect to send support.',
  swap: 'Connect to swap SOCIAL.',
  generic: 'Connect to continue.',
};

const CONNECT_CTA_LABELS: Record<PortalConnectAction, string> = {
  'governance.viewPosition': 'Connect to view position',
  'governance.create': 'Connect to propose',
  'governance.policy': 'Connect to submit policy',
  'governance.manage': 'Connect to manage position',
  'governance.vote': 'Connect to vote',
  'governance.delegate': 'Connect to delegate',
  'partners.apply': 'Connect to apply',
  'onapi.manage': 'Connect to manage API access',
  'season.claim': 'Connect to check payout',
  'season.join': 'Connect to join',
  boost: 'Connect to boost',
  endorse: 'Connect to endorse',
  support: 'Connect to send support',
  swap: 'Connect to swap',
  generic: 'Connect to continue',
};

export const PORTAL_CONNECT_NAV_HINT = 'Use the wallet menu above.';

export function portalConnectMessage(action: PortalConnectAction): string {
  return CONNECT_MESSAGES[action];
}

export function portalConnectCtaLabel(action: PortalConnectAction): string {
  return CONNECT_CTA_LABELS[action];
}

/** Action button label while wallet bootstrap resolves or when disconnected. */
export function portalConnectButtonLabel(
  action: PortalConnectAction,
  options: {
    isWalletBootstrapping?: boolean;
    isConnected: boolean;
    connectedLabel: string;
  }
): string {
  if (options.isWalletBootstrapping) return 'Checking wallet…';
  if (!options.isConnected) return portalConnectCtaLabel(action);
  return options.connectedLabel;
}

/** Short copy for errors, toasts, and disabled control hints. */
export function portalConnectWalletError(verb: string): string {
  return `Connect your wallet to ${verb}.`;
}
