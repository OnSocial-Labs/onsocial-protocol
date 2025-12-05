'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import {
  User,
  Blocks,
  Globe,
  Lock,
  Coins,
  Code,
} from 'lucide-react'
import { TiltCard } from '@/components/effects/tilt-card'

const features = [
  {
    title: 'Decentralized Identity',
    description: 'Own your digital identity. Control your data, reputation, and social graph across all platforms.',
    icon: User,
    color: '#00ec96',
    isPurple: false,
  },
  {
    title: 'Composable Actions',
    description: 'Build complex social interactions with simple, reusable building blocks. Infinite possibilities.',
    icon: Blocks,
    color: '#A05CFF',
    isPurple: true,
  },
  {
    title: 'Cross-Chain Ready',
    description: 'Seamlessly interact across multiple blockchains. One identity, infinite networks.',
    icon: Globe,
    color: '#00ec96',
    isPurple: false,
  },
  {
    title: 'Privacy First',
    description: 'Your data, your rules. Zero-knowledge proofs ensure privacy without sacrificing functionality.',
    icon: Lock,
    color: '#A05CFF',
    isPurple: true,
  },
  {
    title: 'Token Economics',
    description: 'Fair, transparent reward systems. Creators earn, communities thrive, users own value.',
    icon: Coins,
    color: '#00ec96',
    isPurple: false,
  },
  {
    title: 'Developer Friendly',
    description: 'Powerful APIs, extensive docs, and SDKs. Build the next generation of social apps.',
    icon: Code,
    color: '#A05CFF',
    isPurple: true,
  },
]

export function Features() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.2 })

  return (
    <section id="features" ref={ref} className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Built for the Next Generation of Social
          </h2>
          <p className="text-xl text-muted-foreground">
            Everything you need to build powerful, decentralized social applications at scale
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 50 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative"
              >
                <TiltCard>
                  <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-8 hover:border-[#00ec96]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[#00ec96]/10">
                    <Icon 
                      className="w-12 h-12 mb-6 group-hover:scale-110 transition-transform duration-300"
                      style={{
                        color: feature.color,
                        filter: feature.isPurple 
                          ? 'drop-shadow(0 0 8px rgba(160, 92, 255, 0.3))' 
                          : 'drop-shadow(0 0 8px rgba(0, 236, 150, 0.3))'
                      }}
                    />
                    <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </TiltCard>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
