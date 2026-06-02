import { Hero } from '@/components/sections/hero';
import { GenesisRallyHome } from '@/components/sections/genesis-rally-home';
import { CommunityBanner } from '@/components/sections/community-banner';
import { ProtocolExplorer } from '@/components/sections/protocol-explorer';
import { LeaderboardPreview } from '@/components/sections/leaderboard-preview';
import { SystemStatus } from '@/components/sections/system-status';
import { CTA } from '@/components/sections/cta';
import { loadProtocolPulse } from '@/lib/protocol-pulse-server';

export default async function Home() {
  const initialPulse = await loadProtocolPulse();

  return (
    <>
      <Hero initialPulse={initialPulse} />
      <GenesisRallyHome />
      <CommunityBanner />
      <CTA />
      <ProtocolExplorer />
      <LeaderboardPreview />
      <SystemStatus />
    </>
  );
}
