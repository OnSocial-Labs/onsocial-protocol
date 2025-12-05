import { Hero } from '@/components/sections/hero'
import { Features } from '@/components/sections/features'
import { CTA } from '@/components/sections/cta'
import { Roadmap } from '@/components/sections/roadmap'

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <Roadmap />
      <CTA />
    </>
  )
}
