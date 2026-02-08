// src/core/types.ts
// Core types for @onsocial/client

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
    rpcUrl: 'https://near.lava.build',
    contractId: 'core.onsocial.near',
    hasuraUrl: 'https://hasura.onsocial.id/v1/graphql',
  },
  testnet: {
    networkId: 'testnet',
    rpcUrl: 'https://neart.lava.build',
    contractId: 'core.onsocial.testnet',
    hasuraUrl: 'https://hasura.onsocial.id/v1/graphql',
  },
};
