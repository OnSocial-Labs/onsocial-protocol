// src/types.ts
// Centralized types for onsocial-js

/**
 * Represents a NEAR account key pair in base58 encoding.
 * @property publicKey - The public key (base58 encoded)
 * @property secretKey - The secret/private key (base58 encoded)
 */
export interface AccountKeyPair {
  publicKey: string; // base58
  secretKey: string; // base58
}

/**
 * Supported NEAR networks.
 * - 'mainnet': The NEAR main network
 * - 'testnet': The NEAR test network
 */
export type Network = 'mainnet' | 'testnet';

/**
 * Generic NEAR RPC response type.
 * @template T - The type of the result field
 * @property jsonrpc - The JSON-RPC version
 * @property id - The request ID
 * @property result - The result payload
 * @property error - Optional error object
 */
export interface NearRpcResult<T = any> {
  jsonrpc: string;
  id: string | number;
  result: T;
  error?: { code: number; message: string; data?: any };
}

/**
 * Minimal NEAR transaction type (expand as needed).
 * @property signerId - The account ID of the signer
 * @property publicKey - The signer's public key (base58 encoded)
 * @property receiverId - The account ID of the receiver
 * @property actions - The list of actions in the transaction
 * @property nonce - The transaction nonce
 * @property blockHash - The block hash as Uint8Array
 */
export interface NearTransaction {
  signerId: string;
  publicKey: string; // base58
  receiverId: string;
  actions: any[];
  nonce: number;
  blockHash: Uint8Array;
}

// Re-export important NEAR types from @near-js packages for SDK consumers
export type {
  Transaction,
  Action,
  SignedTransaction,
} from '@near-js/transactions';
export type {
  AccountView,
  AccessKeyView,
  AccessKeyInfoView,
  AccessKeyList,
  AccountBalanceInfo,
} from '@near-js/types';

// You can expand this file with more types as your SDK grows.
// For example:
// export interface Transaction { ... }
// export interface NearRpcResult { ... }
// export type Network = 'mainnet' | 'testnet';
