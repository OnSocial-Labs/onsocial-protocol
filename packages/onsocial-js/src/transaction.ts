// src/transaction.ts
import {
  createTransaction,
  encodeTransaction,
  Transaction,
} from '@near-js/transactions';
import { PublicKey } from '@near-js/crypto';

export type BuildTransactionParams = {
  signerId: string;
  publicKey: string; // base58
  receiverId: string;
  actions: any[];
  nonce: number;
  blockHash: Uint8Array;
};

export function buildTransaction(params: BuildTransactionParams): Transaction {
  return createTransaction(
    params.signerId,
    PublicKey.from(params.publicKey),
    params.receiverId,
    params.nonce,
    params.actions,
    params.blockHash
  );
}

export const serializeTransaction = encodeTransaction;
