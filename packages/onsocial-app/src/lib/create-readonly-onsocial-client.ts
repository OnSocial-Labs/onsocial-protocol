import { OnSocial } from '@onsocial/sdk';
import { ACTIVE_API_URL, ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

export function createReadOnlyOnSocialClient(): OnSocial {
  return new OnSocial({
    network: ACTIVE_NEAR_NETWORK,
    gatewayUrl: ACTIVE_API_URL,
  });
}
