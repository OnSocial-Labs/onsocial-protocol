import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import type { ProtocolPulseSnapshot } from '@/lib/protocol-pulse-metrics';

/** Server-side protocol pulse (gateway analytics cache ~60s). */
export async function loadProtocolPulse(): Promise<ProtocolPulseSnapshot | null> {
  try {
    const os = createPortalServerOnSocialClient();
    return await os.query.stats.protocolPulse();
  } catch {
    return null;
  }
}

export const PROTOCOL_PULSE_REVALIDATE_SECONDS = 60;
