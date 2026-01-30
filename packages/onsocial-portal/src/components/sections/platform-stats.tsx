'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, Users, MessageSquare, DollarSign, UsersRound, Code2, Clock, Network, Zap, Lock } from 'lucide-react'

interface PublicStats {
  platform: {
    totalPosts: number
    totalUsers: number
    totalGroups: number
    last24h: number
  }
  system: {
    status: string
    network: string
    version: string
    uptime: number
    avgResponseTime: number
  }
  credits: {
    totalPurchased: number
    activeDevelopers: number
    socialPrice: number
    totalLocked: number
  }
}

export function PlatformStats() {
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchStats()
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchStats() {
    try {
      // Use production API in production, localhost in development
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.onsocial.id'
      const res = await fetch(`${apiUrl}/public/stats`)
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading || !stats || !stats.platform) {
    return null
  }

  const statCards = [
    {
      icon: MessageSquare,
      label: 'Total Posts',
      value: formatNumber(stats.platform.totalPosts),
      color: 'from-green-500 to-emerald-500',
    },
    {
      icon: Users,
      label: 'Active Users',
      value: formatNumber(stats.platform.totalUsers),
      color: 'from-blue-500 to-cyan-500',
    },
    {
      icon: UsersRound,
      label: 'Communities',
      value: formatNumber(stats.platform.totalGroups),
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: Activity,
      label: 'Last 24h',
      value: formatNumber(stats.platform.last24h),
      color: 'from-orange-500 to-red-500',
    },
    {
      icon: Code2,
      label: 'Developers',
      value: formatNumber(stats.credits.activeDevelopers),
      color: 'from-cyan-500 to-blue-500',
    },
    {
      icon: DollarSign,
      label: 'SOCIAL Price',
      value: `$${stats.credits.socialPrice.toFixed(2)}`,
      color: 'from-yellow-500 to-orange-500',
    },
    {
      icon: Clock,
      label: 'Gateway Uptime',
      value: formatUptime(stats.system.uptime),
      color: 'from-indigo-500 to-purple-500',
    },
    {
      icon: Network,
      label: 'Network Status',
      value: stats.system.network.toUpperCase(),
      color: 'from-pink-500 to-rose-500',
      badge: true,
    },
    {
      icon: Zap,
      label: 'API Response',
      value: `${stats.system.avgResponseTime}ms`,
      color: 'from-teal-500 to-green-500',
    },
    {
      icon: Lock,
      label: 'Total Staked',
      value: `$${formatNumber(stats.credits.totalLocked)}`,
      color: 'from-violet-500 to-purple-500',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="w-full max-w-5xl mx-auto mt-12"
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.4 + index * 0.1 }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl blur-xl -z-10"
                style={{
                  background: `linear-gradient(to right, var(--tw-gradient-stops))`,
                }}
              />
              <div className="relative bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-2xl p-6 hover:border-[#00ec96]/30 transition-all duration-300">
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl bg-gradient-to-r ${stat.color} bg-opacity-10`}>
                    <Icon className="w-5 h-5 text-white" style={{
                      filter: 'drop-shadow(0 0 8px currentColor)',
                    }} />
                  </div>
                  {(stat.label === 'Last 24h' || stat.label === 'Gateway Uptime') && (
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-[#00ec96] rounded-full animate-pulse" />
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* System Status Badge */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex items-center justify-center mt-6 space-x-4 text-sm text-muted-foreground"
      >
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-[#00ec96] rounded-full animate-pulse" />
          <span className="capitalize">{stats.system.status}</span>
        </div>
        <span>•</span>
        <span className="capitalize">{stats.system.network}</span>
        <span>•</span>
        <span>{formatNumber(stats.credits.activeDevelopers)} Active Developers</span>
      </motion.div>
    </motion.div>
  )
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days > 0) {
    return `${days}d ${hours}h`
  }
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}
