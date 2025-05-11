import nacl from 'tweetnacl';
import fetch from 'cross-fetch';

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
}
