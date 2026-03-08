'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, Coins, Handshake, Github } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CTA() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.3 })

  return (
    <section ref={ref} className="py-24 relative">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold tracking-[-0.03em] mb-4">
            Get Involved
          </h2>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            Whether you&apos;re here to earn or to build — there&apos;s a place for you.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {/* For Users */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="border border-border/50 rounded-2xl p-8 bg-muted/30 flex flex-col"
          >
            <div className="w-12 h-12 rounded-xl border border-[#3B82F6]/30 flex items-center justify-center mb-5">
              <Coins className="w-6 h-6 text-[#3B82F6]" />
            </div>
            <h3 className="text-xl font-bold tracking-[-0.02em] mb-2">For Token Holders</h3>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6 flex-1">
              Stake your $SOCIAL tokens and earn rewards. Choose your lock period for higher effective stake.
            </p>
            <Button asChild className="group w-full">
              <Link href="/staking">
                Stake $SOCIAL
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </Button>
          </motion.div>

          {/* For Builders */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="border border-border/50 rounded-2xl p-8 bg-muted/30 flex flex-col"
          >
            <div className="w-12 h-12 rounded-xl border border-[#A855F7]/30 flex items-center justify-center mb-5">
              <Handshake className="w-6 h-6 text-[#A855F7]" />
            </div>
            <h3 className="text-xl font-bold tracking-[-0.02em] mb-2">For Dapp Builders</h3>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6 flex-1">
              Register your dapp, get an API key, and integrate OnSocial rewards into your platform.
            </p>
            <Button variant="secondary" asChild className="group w-full">
              <Link href="/partners">
                Become a Partner
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </Button>
          </motion.div>
        </div>

        {/* Open source note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex items-center justify-center gap-4 mt-8 text-sm text-muted-foreground"
        >
          <span>100% open source</span>
          <span className="text-border">|</span>
          <Link
            href="https://github.com/OnSocial-Labs"
            target="_blank"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Github className="w-4 h-4" />
            View on GitHub
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
