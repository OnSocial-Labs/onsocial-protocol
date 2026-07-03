import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

export const CORE_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'core.onsocial.near'
    : 'core.onsocial.testnet';
