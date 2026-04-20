import type { Network } from './types.js';

export const CONTRACTS = {
  mainnet: {
    core: 'core.onsocial.near',
    scarces: 'scarces.onsocial.near',
    rewards: 'rewards.onsocial.near',
    boost: 'boost.onsocial.near',
    token: 'token.onsocial.near',
  },
  testnet: {
    core: 'core.onsocial.testnet',
    scarces: 'scarces.onsocial.testnet',
    rewards: 'rewards.onsocial.testnet',
    boost: 'boost.onsocial.testnet',
    token: 'token.onsocial.testnet',
  },
} as const;

export type ContractName = keyof (typeof CONTRACTS)['mainnet'];

export function resolveContractId(
  network: Network,
  contract: ContractName
): string {
  return CONTRACTS[network][contract];
}