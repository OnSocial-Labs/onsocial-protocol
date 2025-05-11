export declare class OnSocialSDK {
  private rpcUrl;
  private contractId;
  private keyPair?;
  constructor({
    network,
    contractId,
  }: {
    network?: 'testnet' | 'mainnet';
    contractId?: string;
  });
  fastGet(method: string, args: Record<string, any>): Promise<any>;
  repostPost(postId: string, accountId: string): Promise<any>;
  loginWithBiometrics(pin: string): Promise<{
    publicKey: string;
  }>;
}
