import { OnSocial } from '@onsocial/sdk';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { BROWSER_GATEWAY_PROXY } from '@/lib/app-gateway-url';

export function createReadOnlyOnSocialClient(): OnSocial {
  return new OnSocial({
    network: ACTIVE_NEAR_NETWORK,
    gatewayUrl: BROWSER_GATEWAY_PROXY,
  });
}
