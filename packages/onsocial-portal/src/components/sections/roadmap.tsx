'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { CheckCircle2, Circle, Clock } from 'lucide-react'

const roadmapItems = [
  {
    quarter: 'Q4 2024',
    title: 'Protocol Design',
    description: 'Architecture planning and technical specifications',
    status: 'completed',
  },
  {
    quarter: 'Q1 2025',
    title: 'Core Contract Development',
    description: 'Building foundational smart contracts on NEAR',
    status: 'in-progress',
  },
  {
    quarter: 'Q1 2025',
    title: 'NFT Marketplace Contract',
    description: 'Decentralized marketplace infrastructure',
    status: 'in-progress',
  },
  {
    quarter: 'Q2 2025',
    title: 'Event Ticketing System',
    description: 'On-chain ticketing with NFT verification',
    status: 'planned',
  },
  {
    quarter: 'Q2 2025',
    title: 'Community Features',
    description: 'Token-gated communities and governance',
    status: 'planned',
  },
  {
    quarter: 'Q3 2025',
    title: 'Company Profiles',
    description: 'Business identity and verification system',
    status: 'planned',
  },
  {
    quarter: 'Q4 2025',
    title: 'Mobile Applications',
    description: 'iOS and Android native apps',
    status: 'planned',
  },
  {
    quarter: 'Q1 2026',
    title: 'Mainnet Launch',
    description: 'Public release and full ecosystem deployment',
    status: 'planned',
  },
]

export function Roadmap() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.2 })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-6 h-6 text-[#00ec96]" />
      case 'in-progress':
        return <Clock className="w-6 h-6 text-[#A05CFF]" />
      default:
        return <Circle className="w-6 h-6 text-muted-foreground" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-[#00ec96]/50'
      case 'in-progress':
        return 'border-[#A05CFF]/50'
      default:
        return 'border-border'
    }
  }

  return (
    <section id="roadmap" ref={ref} className="py-24 relative overflow-hidden bg-muted/30">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Development Roadmap
          </h2>
          <p className="text-xl text-muted-foreground">
            Follow our journey to building the future of decentralized social infrastructure
          </p>
        </motion.div>

        {/* Timeline */}
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[29px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#00ec96] via-[#A05CFF] to-border" />

            {/* Roadmap items */}
            <div className="space-y-8">
              {roadmapItems.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -50 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="relative flex gap-6"
                >
                  {/* Icon */}
                  <div className="relative z-10 flex-shrink-0">
                    {getStatusIcon(item.status)}
                  </div>

                  {/* Content card */}
                  <div className={`flex-1 bg-card/50 backdrop-blur-xl border ${getStatusColor(item.status)} rounded-xl p-6 hover:border-[#00ec96]/50 transition-all duration-300`}>
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="text-xl font-bold">{item.title}</h3>
                      <span className="text-sm font-medium text-[#00ec96] bg-[#00ec96]/10 px-3 py-1 rounded-full whitespace-nowrap">
                        {item.quarter}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{item.description}</p>
                    
                    {/* Status badge */}
                    {item.status === 'in-progress' && (
                      <div className="mt-3 inline-flex items-center gap-2 text-sm">
                        <div className="w-2 h-2 bg-[#A05CFF] rounded-full animate-pulse" />
                        <span className="text-[#A05CFF] font-medium">In Progress</span>
                      </div>
                    )}
                    {item.status === 'completed' && (
                      <div className="mt-3 inline-flex items-center gap-2 text-sm">
                        <div className="w-2 h-2 bg-[#00ec96] rounded-full" />
                        <span className="text-[#00ec96] font-medium">Completed</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
