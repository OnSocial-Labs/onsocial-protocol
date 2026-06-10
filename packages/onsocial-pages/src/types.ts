// Shared types for the pages subdomain router.

export interface Env {
  GATEWAY_URL?: string;
  PUBLIC_API_URL?: string;
  PUBLIC_APP_URL?: string;
  PUBLIC_PAGE_BASE_DOMAIN?: string;
  NEAR_NETWORK?: 'testnet' | 'mainnet';
}
