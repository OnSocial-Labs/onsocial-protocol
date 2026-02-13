// src/core/types.ts
// Core types for @onsocial/client

import { FALLBACK_RPC_URLS, type Network } from '@onsocial/rpc';

export type { Network } from '@onsocial/rpc';

/**
 * Network configuration
 */
export interface NetworkConfig {
  networkId: Network;
  rpcUrl: string;
  contractId: string;
  /** Hasura GraphQL endpoint (requires graphql-default naming convention) */
  hasuraUrl: string;
  /** Optional Hasura admin secret for authenticated queries */
  hasuraAdminSecret?: string;
}

/**
 * Default network configurations
 *
 * IMPORTANT: Hasura must be configured with naming convention: graphql-default
 * This enables camelCase field names in GraphQL responses.
 *
 * @see https://hasura.io/docs/latest/schema/postgres/naming-convention/
 */
export const NETWORKS: Record<Network, NetworkConfig> = {
  mainnet: {
    networkId: 'mainnet',
    rpcUrl: FALLBACK_RPC_URLS.mainnet,
    contractId: 'core.onsocial.near',
    hasuraUrl: 'https://hasura.onsocial.id/v1/graphql',
  },
  testnet: {
    networkId: 'testnet',
    rpcUrl: FALLBACK_RPC_URLS.testnet,
    contractId: 'core.onsocial.testnet',
    hasuraUrl: 'https://hasura.onsocial.id/v1/graphql',
  },
};
