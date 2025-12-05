'use client'

import { motion } from 'framer-motion'
import { useInView } from 'framer-motion'
import { useRef } from 'react'
import { TrendingUp, Users, Zap, Shield } from 'lucide-react'
import { TiltCard } from '@/components/effects/tilt-card'

const stats = [
  {
    icon: Users,
    value: '10,000+',
    label: 'Active Users',
    color: '#00ec96',
    isPurple: false,
  },
  {
    icon: TrendingUp,
    value: '1M+',
    label: 'Transactions',
    color: '#00ec96',
    isPurple: false,
  },
  {
    icon: Zap,
    value: '<100ms',
    label: 'Avg. Latency',
    color: '#A05CFF',
    isPurple: true,
  },
  {
    icon: Shield,
    value: '99.9%',
    label: 'Uptime',
    color: '#00ec96',
    isPurple: false,
  },
]

export function Stats() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.3 })

  return (
    <section ref={ref} className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 50 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative group"
              >
                <TiltCard>
                  <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-6 hover:border-[#00ec96]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[#00ec96]/10">
                    {/* Icon - No background, just colored vector */}
                    <Icon 
                      className="w-10 h-10 mb-4 group-hover:scale-110 transition-transform duration-300"
                      style={{
                        color: stat.color,
                        filter: stat.isPurple 
                          ? 'drop-shadow(0 0 6px rgba(160, 92, 255, 0.4))' 
                          : 'drop-shadow(0 0 6px rgba(0, 236, 150, 0.4))'
                      }}
                    />
                    <div className="text-3xl font-bold mb-2">{stat.value}</div>
                    <div className="text-muted-foreground text-sm">{stat.label}</div>
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
