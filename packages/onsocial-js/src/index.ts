// src/index.ts
// Main entry point for onsocial-js
import fetch from 'cross-fetch';

export * from './transaction';
export * from './utils';
export * from './keystore';
export * from './accounts';
export * from './types';

// Explicitly re-export AccountKeyPair from types to avoid ambiguity
export type {
  AccountKeyPair,
  Network,
  NearRpcResult,
  NearTransaction,
} from './types';

export interface OnSocialSDKOptions {
  network: 'mainnet' | 'testnet';
}

export class OnSocialSDK {
  rpcUrl: string;
  constructor(options: OnSocialSDKOptions) {
    this.rpcUrl =
      options.network === 'mainnet'
        ? 'https://rpc.mainnet.near.org'
        : 'https://test.rpc.fastnear.com';
  }

  async fastGet(method: string, params: any) {
    const body = {
      jsonrpc: '2.0',
      id: 'dontcare',
      method: 'query',
      params: {
        request_type: method,
        ...params,
      },
    };
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.result && data.result.result) {
      // NEAR RPC returns result as Uint8Array (array of numbers)
      const buf = Buffer.from(data.result.result);
      try {
        return JSON.parse(buf.toString());
      } catch {
        return buf;
      }
    }
    return data.result || data;
  }

  async loginWithBiometrics(pin: string) {
    // Stub: simulate login
    return { publicKey: 'mockPublicKey' };
  }
}
