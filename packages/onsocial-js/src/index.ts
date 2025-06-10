import nacl from 'tweetnacl';
import fetch from 'cross-fetch';
import { createTransaction, SCHEMA, Transaction, createAction, functionCall, transfer } from '@near-js/transactions';
import { serialize } from 'borsh';
import bs58 from 'bs58';
import * as base64js from 'base64-js';
import { Action } from '@near-js/types';

interface FastGetArgs {
  [key: string]: string | number | boolean | object;
}

export class OnSocialSDK {
  private rpcUrl: string;
  private contractId: string;
  private keyPair?: nacl.SignKeyPair;

  constructor({
    network = 'testnet',
    contractId = `social.onsocial.${network}`,
  }: {
    network?: 'testnet' | 'mainnet';
    contractId?: string;
  }) {
    this.rpcUrl =
      network === 'testnet'
        ? 'https://test.rpc.fastnear.com'
        : 'https://free.rpc.fastnear.com';
    this.contractId = contractId;
  }

  async fastGet(method: string, args: FastGetArgs) {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'dontcare',
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: this.contractId,
          method_name: method,
          args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
        },
      }),
    });
    const result = await response.json();
    if (result.error) {
      console.error('fastGet error:', result.error);
      throw new Error(result.error.message || 'Unknown server error');
    }
    return JSON.parse(Buffer.from(result.result.result).toString());
  }

  async repostPost(postId: string, accountId: string) {
    if (!this.keyPair) throw new Error('Not authenticated');
    const args = { post_id: postId, account_id: accountId };
    const message = Buffer.from(JSON.stringify(args));
    const signature = nacl.sign.detached(message, this.keyPair.secretKey);
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'dontcare',
        method: 'call',
        params: {
          account_id: this.contractId,
          method_name: 'repost_post',
          args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
          signature: Buffer.from(signature).toString('base64'),
          public_key: Buffer.from(this.keyPair.publicKey).toString('base64'),
        },
      }),
    });
    const result = await response.json();
    if (result.error) throw new Error(result.error.message);
    return result;
  }

  async loginWithBiometrics(pin: string) {
    this.keyPair = nacl.sign.keyPair.fromSeed(Buffer.from(pin.padEnd(32, '0')));
    return {
      publicKey: Buffer.from(this.keyPair.publicKey).toString('base64'),
    };
  }

  // Build a NEAR transaction (minimal example)
  buildTransaction(params: {
    signerId: string;
    publicKey: string;
    nonce: number;
    receiverId: string;
    actions: any[];
    blockHash: Uint8Array;
  }): Transaction {
    return createTransaction(
      params.signerId,
      params.publicKey,
      params.nonce,
      params.receiverId,
      params.actions,
      params.blockHash
    );
  }

  // Serialize a NEAR transaction for signing
  serializeTransaction(tx: Transaction): Uint8Array {
    return serialize(SCHEMA, tx);
  }

  // Base58 encode/decode
  encodeBase58(data: Uint8Array): string {
    return bs58.encode(data);
  }
  decodeBase58(str: string): Uint8Array {
    return bs58.decode(str);
  }

  // Base64 encode/decode
  encodeBase64(data: Uint8Array): string {
    return base64js.fromByteArray(data);
  }
  decodeBase64(str: string): Uint8Array {
    return base64js.toByteArray(str);
  }

  // Create a transfer action (amount in yoctoNEAR as string)
  createTransferAction(amount: string): Action {
    return transfer(amount);
  }

  // Create a function call action
  createFunctionCallAction(
    methodName: string,
    args: object,
    gas: string,
    deposit: string
  ): Action {
    return functionCall(methodName, args, gas, deposit);
  }
}
