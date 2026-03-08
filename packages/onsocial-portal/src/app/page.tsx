import { Hero } from '@/components/sections/hero'
import { CommunityBanner } from '@/components/sections/community-banner'
import { Vision } from '@/components/sections/vision'
import { CTA } from '@/components/sections/cta'

export default function Home() {
  return (
    <>
      <Hero />
      <CommunityBanner />
      <Vision />
      <CTA />
    </>
  )
}
