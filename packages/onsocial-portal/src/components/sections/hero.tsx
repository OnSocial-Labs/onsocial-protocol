'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Github, BookOpen, Palette, Ticket, Users, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MagneticButton } from '@/components/effects/magnetic-button'
import { GradientMesh } from '@/components/effects/gradient-mesh'
import { AnimatedGrid } from '@/components/effects/animated-grid'

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24 md:pt-16">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-green-50 via-emerald-50 to-blue-50 dark:from-green-950/20 dark:via-emerald-950/20 dark:to-blue-950/20" />
      
      {/* Gradient Mesh - No grid, just floating orbs */}
      <GradientMesh />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center space-x-2 bg-[#00ec96]/10 border border-[#00ec96]/20 px-4 py-2 rounded-full text-sm font-medium">
              <div className="w-2 h-2 bg-[#00ec96] rounded-full animate-pulse" />
              <span>Coming Q1 2026</span>
            </div>
          </motion.div>

          {/* Main heading */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight"
          >
            Build the Future of{' '}
            <span className="bg-gradient-to-r from-[#00ec96] to-[#A05CFF] bg-clip-text text-transparent">
              Social
            </span>
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto"
          >
            Building decentralized social infrastructure on NEAR Protocol.
            NFT marketplace, event ticketing, communities, and more—all on-chain.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Button size="lg" asChild className="group">
                <Link href="/roadmap">
                  <BookOpen className="w-4 h-4 mr-2" />
                  View Roadmap
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Button size="lg" variant="outline" asChild>
                <Link href="https://github.com/OnSocial-Labs" target="_blank">
                  <Github className="w-4 h-4 mr-2" />
                  Follow Development
                </Link>
              </Button>
            </motion.div>
          </motion.div>

          {/* Coming Soon Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-12 max-w-3xl mx-auto"
          >
            {[
              { label: 'NFT Marketplace', Icon: Palette },
              { label: 'Event Ticketing', Icon: Ticket },
              { label: 'Communities', Icon: Users },
              { label: 'Company Profiles', Icon: Building2 },
            ].map((feature, i) => (
              <motion.div
                key={feature.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.5 + i * 0.1 }}
                className="text-center p-4 bg-card/30 backdrop-blur-sm border border-border rounded-xl hover:border-[#00ec96]/30 transition-colors"
              >
                <feature.Icon className="w-8 h-8 mx-auto mb-2 text-[#00ec96]" />
                <div className="text-sm font-medium">{feature.label}</div>
                <div className="text-xs text-muted-foreground mt-1">Coming Soon</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-6 h-10 border-2 border-muted-foreground/30 rounded-full flex items-start justify-center p-2"
        >
          <motion.div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full" />
        </motion.div>
      </motion.div>
    </section>
  )
}
