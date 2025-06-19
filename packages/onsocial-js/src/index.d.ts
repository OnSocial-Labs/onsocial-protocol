// TypeScript declarations for onsocial-js
export * from './transaction';
export * from './utils';
export * from './keystore';
export * from './accounts';
export interface OnSocialSDKOptions {
  network: 'mainnet' | 'testnet';
}
export declare class OnSocialSDK {
  rpcUrl: string;
  constructor(options: OnSocialSDKOptions);
  fastGet(method: string, params: any): Promise<any>;
  loginWithBiometrics(pin: string): Promise<{ publicKey: string }>;
}
