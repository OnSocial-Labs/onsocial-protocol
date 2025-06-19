// src/accounts.ts
// Expo Go compatible NEAR account management for onsocial-js
import { AccountKeyPair } from './types';
import nacl from 'tweetnacl';
import { encodeBase58, decodeBase58 } from './utils';
import { Keystore } from './keystore';

export class AccountManager {
  /**
   * Generate a new NEAR-compatible key pair and store it under the given accountId.
   */
  static async createAccount(accountId: string): Promise<AccountKeyPair> {
    const keyPair = nacl.sign.keyPair();
    const publicKey = encodeBase58(keyPair.publicKey);
    const secretKey = encodeBase58(keyPair.secretKey);
    await Keystore.setItem(`account:${accountId}:publicKey`, publicKey);
    await Keystore.setItem(`account:${accountId}:secretKey`, secretKey);
    return { publicKey, secretKey };
  }

  /**
   * Load an existing key pair for the given accountId from secure storage.
   */
  static async loadAccount(accountId: string): Promise<AccountKeyPair | null> {
    const publicKey = await Keystore.getItem(`account:${accountId}:publicKey`);
    const secretKey = await Keystore.getItem(`account:${accountId}:secretKey`);
    if (publicKey && secretKey) {
      return { publicKey, secretKey };
    }
    return null;
  }

  /**
   * Remove the key pair for the given accountId from secure storage.
   */
  static async removeAccount(accountId: string): Promise<void> {
    await Keystore.removeItem(`account:${accountId}:publicKey`);
    await Keystore.removeItem(`account:${accountId}:secretKey`);
  }

  /**
   * Sign a message with the account's secret key.
   */
  static async sign(
    accountId: string,
    message: Uint8Array
  ): Promise<Uint8Array> {
    const keyPair = await this.loadAccount(accountId);
    if (!keyPair) throw new Error('Account not found');
    const secretKey = decodeBase58(keyPair.secretKey);
    return nacl.sign.detached(message, secretKey);
  }
}
