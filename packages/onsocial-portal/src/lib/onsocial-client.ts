import { OnSocial, type OnSocialConfig } from '@onsocial/sdk';
import {
  portalNetworkProfile,
  readPortalNetwork,
  type PortalNearNetwork,
} from '@/lib/portal-network';

export type PortalOnSocialConfig = Omit<
  OnSocialConfig,
  'network' | 'gatewayUrl'
> &
  Partial<Pick<OnSocialConfig, 'network' | 'gatewayUrl'>>;

export function createPortalOnSocialClient(
  config: PortalOnSocialConfig = {}
): OnSocial {
  const network = (config.network ?? readPortalNetwork()) as PortalNearNetwork;
  const profile = portalNetworkProfile(network);
  const { network: _network, gatewayUrl = profile.apiUrl, ...rest } = config;

  return new OnSocial({
    network,
    gatewayUrl,
    ...rest,
  });
}
