import { Hero } from '@/components/sections/hero';
import { CommunityBanner } from '@/components/sections/community-banner';
import { ProtocolExplorer } from '@/components/sections/protocol-explorer';
import { LeaderboardPreview } from '@/components/sections/leaderboard-preview';
import { SystemStatus } from '@/components/sections/system-status';
import { CTA } from '@/components/sections/cta';

export default function Home() {
  return (
    <>
      <Hero />
      <CommunityBanner />
      <CTA />
      <ProtocolExplorer />
      <LeaderboardPreview />
      <SystemStatus />
    </>
  );
}
