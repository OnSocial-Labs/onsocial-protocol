'use client'

import { useEffect, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import {
  Activity,
  Globe,
  Zap,
  Database,
  Clock,
  Network,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'

interface HealthData {
  gateway: { status: 'up' | 'down'; responseTime: number } | null
  relayer: { status: 'up' | 'down'; responseTime: number } | null
  stats: {
    uptime: number
    network: string
    totalPosts: number
    totalUsers: number
    activeDevelopers: number
    avgResponseTime: number
  } | null
}

export function SystemStatus() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.2 })
  const [health, setHealth] = useState<HealthData>({
    gateway: null,
    relayer: null,
    stats: null,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  async function checkHealth() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.onsocial.id'

    const results: HealthData = { gateway: null, relayer: null, stats: null }

    // Check gateway
    try {
      const start = performance.now()
      const res = await fetch(`${apiUrl}/public/stats`, { signal: AbortSignal.timeout(5000) })
      const elapsed = Math.round(performance.now() - start)
      if (res.ok) {
        const data = await res.json()
        results.gateway = { status: 'up', responseTime: elapsed }
        results.stats = {
          uptime: data.system?.uptime || 0,
          network: data.system?.network || 'testnet',
          totalPosts: data.platform?.totalPosts || 0,
          totalUsers: data.platform?.totalUsers || 0,
          activeDevelopers: data.credits?.activeDevelopers || 0,
          avgResponseTime: data.system?.avgResponseTime || 0,
        }
      } else {
        results.gateway = { status: 'down', responseTime: elapsed }
      }
    } catch {
      results.gateway = { status: 'down', responseTime: 0 }
    }

    // Check relayer via gateway relay health
    try {
      const start = performance.now()
      const res = await fetch(`${apiUrl}/relay/health`, { signal: AbortSignal.timeout(5000) })
      const elapsed = Math.round(performance.now() - start)
      results.relayer = { status: res.ok ? 'up' : 'down', responseTime: elapsed }
    } catch {
      results.relayer = { status: 'down', responseTime: 0 }
    }

    setHealth(results)
    setLoading(false)
  }

  const services = [
    {
      name: 'Gateway API',
      description: 'Auth · GraphQL · Compose · Storage',
      icon: Globe,
      status: health.gateway?.status,
      responseTime: health.gateway?.responseTime,
    },
    {
      name: 'Gasless Relayer',
      description: '2-instance HA · GCP KMS signing',
      icon: Zap,
      status: health.relayer?.status,
      responseTime: health.relayer?.responseTime,
    },
    {
      name: 'Smart Contracts',
      description: '6 contracts · NEAR testnet',
      icon: Database,
      status: health.gateway?.status, // If gateway is up, contracts are accessible
      responseTime: undefined,
    },
  ]

  return (
    <section id="status" ref={ref} className="py-24 relative">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold tracking-[-0.03em] mb-4">
            Infrastructure
          </h2>
          <p className="text-lg text-muted-foreground">
            Live system health — updated every 30 seconds
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto">
          {/* Service Status Cards */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {services.map((service, index) => {
              const Icon = service.icon
              return (
                <motion.div
                  key={service.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                >
                  <div className="border border-border/50 rounded-2xl p-6 bg-muted/30 h-full">
                    <div className="flex items-start justify-between mb-4">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                      {loading ? (
                        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                      ) : service.status === 'up' ? (
                        <CheckCircle2 className="w-4 h-4 text-[#4ADE80]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                    <h3 className="font-semibold mb-1">{service.name}</h3>
                    <p className="text-xs text-muted-foreground mb-3">{service.description}</p>
                    {service.responseTime !== undefined && !loading && (
                      <div className="text-xs text-muted-foreground">
                        <span className="text-foreground font-mono">{service.responseTime}ms</span> response
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Stats Bar */}
          {health.stats && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <div className="border border-border/50 rounded-2xl p-6 bg-muted/30">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                  <StatItem
                    icon={Activity}
                    label="Total Posts"
                    value={formatNumber(health.stats.totalPosts)}
                  />
                  <StatItem
                    icon={Activity}
                    label="Users"
                    value={formatNumber(health.stats.totalUsers)}
                  />
                  <StatItem
                    icon={Activity}
                    label="Developers"
                    value={formatNumber(health.stats.activeDevelopers)}
                  />
                  <StatItem
                    icon={Clock}
                    label="Uptime"
                    value={formatUptime(health.stats.uptime)}
                  />
                  <StatItem
                    icon={Network}
                    label="Network"
                    value={health.stats.network.toUpperCase()}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Overall Status Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.5 }}
            className="flex items-center justify-center mt-6 text-xs text-muted-foreground gap-4"
          >
            {!loading && health.gateway?.status === 'up' && health.relayer?.status === 'up' ? (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-[#4ADE80] rounded-full animate-pulse" />
                  <span>All systems operational</span>
                </div>
                <span>•</span>
                <span>api.onsocial.id</span>
              </>
            ) : !loading ? (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                <span>Some services may be degraded</span>
              </div>
            ) : (
              <span>Checking systems...</span>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function StatItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity
  label: string
  value: string
}) {
  return (
    <div className="text-center">
      <div className="text-xl md:text-2xl font-bold tracking-[-0.02em]">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  )
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days > 0) return `${days}d ${hours}h`
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
