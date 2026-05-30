import { OnSocial, type OnSocialConfig } from '@onsocial/sdk';
import { ACTIVE_API_URL, ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';

export type PortalOnSocialConfig = Omit<
  OnSocialConfig,
  'network' | 'gatewayUrl'
> &
  Partial<Pick<OnSocialConfig, 'network' | 'gatewayUrl'>>;

export function createPortalOnSocialClient(
  config: PortalOnSocialConfig = {}
): OnSocial {
  const {
    network = ACTIVE_NEAR_NETWORK,
    gatewayUrl = ACTIVE_API_URL,
    ...rest
  } = config;

  return new OnSocial({
    network,
    gatewayUrl,
    ...rest,
  });
}
