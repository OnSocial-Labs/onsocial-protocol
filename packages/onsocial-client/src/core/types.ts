// src/types.ts
// Core types for onsocial-js

/**
 * Supported NEAR networks
 */
export type Network = 'mainnet' | 'testnet';

/**
 * Network configuration
 */
export interface NetworkConfig {
  networkId: Network;
  rpcUrl: string;
  contractId: string;
  graphUrl: string;
}

/**
 * Default network configurations
 */
export const NETWORKS: Record<Network, NetworkConfig> = {
  mainnet: {
    networkId: 'mainnet',
    rpcUrl: 'https://rpc.mainnet.near.org',
    contractId: 'core.onsocial.near',
    graphUrl: 'https://api.studio.thegraph.com/query/1723512/onsocial-mainnet/version/latest',
  },
  testnet: {
    networkId: 'testnet',
    rpcUrl: 'https://rpc.testnet.near.org',
    contractId: 'core.onsocial.testnet',
    graphUrl: 'https://api.studio.thegraph.com/query/1723512/onsocial-testnet/version/latest',
  },
};
