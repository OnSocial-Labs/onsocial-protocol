import { Hero } from '@/components/sections/hero';
import { CommunityBanner } from '@/components/sections/community-banner';
import { ProtocolExplorer } from '@/components/sections/protocol-explorer';
import { SystemStatus } from '@/components/sections/system-status';
import { CTA } from '@/components/sections/cta';
import { getRequestPortalNetwork } from '@/lib/portal-network-request';
import { loadProtocolPulse } from '@/lib/protocol-pulse-server';

export default async function Home() {
  const network = await getRequestPortalNetwork();
  const initialPulse = await loadProtocolPulse(network);

  return (
    <>
      <Hero initialPulse={initialPulse} />
      <CommunityBanner />
      <CTA />
      <ProtocolExplorer />
      <SystemStatus />
    </>
  );
}
