export type AppNearNetwork = 'testnet' | 'mainnet';

export const ACTIVE_NEAR_NETWORK: AppNearNetwork =
  process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

export const ACTIVE_API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://api.onsocial.id'
    : 'https://testnet.onsocial.id');
