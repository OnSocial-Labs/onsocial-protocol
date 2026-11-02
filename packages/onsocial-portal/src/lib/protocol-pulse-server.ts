import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  portalNetworkProfile,
  type PortalNearNetwork,
} from '@/lib/portal-network';
import {
  emptyProtocolPulse,
  type ProtocolPulseSnapshot,
} from '@/lib/protocol-pulse-metrics';

/** Server-side protocol pulse (gateway analytics cache ~60s). */
export async function loadProtocolPulse(
  network: PortalNearNetwork
): Promise<ProtocolPulseSnapshot | null> {
  const profile = portalNetworkProfile(network);
  try {
    const os = createPortalServerOnSocialClient({
      network,
      gatewayUrl: profile.apiUrl,
    });
    const pulse = await os.query.stats.protocolPulse();
    if (pulse) return pulse;
    return network === 'mainnet' ? emptyProtocolPulse() : null;
  } catch {
    return network === 'mainnet' ? emptyProtocolPulse() : null;
  }
}

export const PROTOCOL_PULSE_REVALIDATE_SECONDS = 60;
