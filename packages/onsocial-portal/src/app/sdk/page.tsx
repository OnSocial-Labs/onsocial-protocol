'use client'

import { motion } from 'framer-motion'
import { Code2, Terminal, Zap, ArrowRight, ExternalLink, Package, BookOpen } from 'lucide-react'
import Link from 'next/link'

const SDK_PACKAGES = [
	{
		name: '@onsocial-id/rewards',
		desc: 'Reward users with $SOCIAL tokens — gasless claims, per-dapp pools, daily caps.',
		status: 'beta' as const,
		color: '#4ADE80',
	},
	{
		name: '@onsocial/auth',
		desc: 'Passwordless NEAR auth with JWT — social login, session management, key rotation.',
		status: 'development' as const,
		color: '#3B82F6',
	},
	{
		name: '@onsocial/intents',
		desc: 'Cross-chain intent execution — bridge, swap, and transact across chains.',
		status: 'development' as const,
		color: '#A855F7',
	},
]

const EXAMPLES = [
	{
		title: 'Telegram Rewards Bot',
		desc: 'Auto-reward group messages with $SOCIAL tokens. 5 lines of code.',
		href: '/partners',
		linkText: 'See integration guide',
	},
	{
		title: 'API Credit Purchase',
		desc: 'Buy API credits with ft_transfer_call to unlock higher rate limits.',
		href: '/onapi',
		linkText: 'View tiers',
	},
	{
		title: 'Staking Interface',
		desc: 'Lock $SOCIAL with time-based bonuses. Pro-rata reward distribution.',
		href: '/staking',
		linkText: 'Try staking',
	},
]

export default function SDKPage() {
	return (
		<div className="min-h-screen pt-24 pb-16">
			<div className="container mx-auto px-4 max-w-4xl">
				{/* Hero */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
					className="text-center mb-16"
				>
					<div className="inline-flex items-center gap-2 px-4 py-2 border border-[#4ADE80]/30 bg-[#4ADE80]/[0.04] rounded-full text-sm text-foreground mb-6">
						<Terminal className="w-4 h-4" />
						In Development
					</div>
					<h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-[-0.03em]">
						OnSocial SDK
					</h1>
					<p className="text-lg text-muted-foreground max-w-xl mx-auto">
						Build on NEAR with authentication, rewards, and cross-chain intents — all from one SDK.
					</p>
				</motion.div>

				{/* Packages */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, delay: 0.1 }}
					className="mb-16"
				>
					<h2 className="text-2xl font-bold tracking-[-0.03em] mb-6">Packages</h2>
					<div className="space-y-3">
						{SDK_PACKAGES.map((pkg) => (
							<div
								key={pkg.name}
								className="border border-border/50 rounded-2xl p-6 bg-muted/30 hover:border-border transition-colors"
							>
								<div className="flex items-start justify-between gap-4">
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-3 mb-2">
											<Package className="w-5 h-5 flex-shrink-0" style={{ color: pkg.color }} />
											<span className="font-mono text-base font-semibold">{pkg.name}</span>
										</div>
										<p className="text-sm text-muted-foreground">{pkg.desc}</p>
									</div>
									<div
										className="px-3 py-1 rounded-full border text-xs font-medium flex-shrink-0"
										style={{
											borderColor: pkg.status === 'beta' ? '#4ADE80' + '40' : '#6B7280' + '40',
											color: pkg.status === 'beta' ? '#4ADE80' : '#6B7280',
											backgroundColor: pkg.status === 'beta' ? '#4ADE80' + '08' : '#6B7280' + '08',
										}}
									>
										{pkg.status === 'beta' ? 'Beta' : 'Coming Soon'}
									</div>
								</div>
							</div>
						))}
					</div>
				</motion.div>

				{/* Quick Install */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, delay: 0.15 }}
					className="mb-16"
				>
					<h2 className="text-2xl font-bold tracking-[-0.03em] mb-6">Quick Start</h2>
					<div className="border border-border/50 rounded-2xl overflow-hidden bg-muted/30">
						<div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
							<Terminal className="w-4 h-4 text-muted-foreground" />
							<span className="text-xs text-muted-foreground font-mono">terminal</span>
						</div>
						<pre className="p-4 overflow-x-auto text-sm font-mono text-muted-foreground">
							<code>npm install @onsocial-id/rewards</code>
						</pre>
					</div>
				</motion.div>

				{/* Examples */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, delay: 0.2 }}
					className="mb-16"
				>
					<h2 className="text-2xl font-bold tracking-[-0.03em] mb-6">Examples</h2>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
						{EXAMPLES.map((ex) => (
							<Link
								key={ex.title}
								href={ex.href}
								className="group border border-border/50 rounded-2xl p-6 bg-muted/30 hover:border-border transition-colors"
							>
								<h3 className="text-sm font-semibold mb-2">{ex.title}</h3>
								<p className="text-xs text-muted-foreground mb-4">{ex.desc}</p>
								<span className="text-xs text-[#3B82F6] font-medium inline-flex items-center gap-1 group-hover:gap-2 transition-all">
									{ex.linkText}
									<ArrowRight className="w-3 h-3" />
								</span>
							</Link>
						))}
					</div>
				</motion.div>

				{/* Source */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.5, delay: 0.25 }}
					className="text-center"
				>
					<a
						href="https://github.com/OnSocial-Labs/onsocial-protocol"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-2 px-6 py-3 border border-border/50 hover:border-border rounded-full text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<BookOpen className="w-4 h-4" />
						View Source & Docs
						<ExternalLink className="w-3 h-3" />
					</a>
				</motion.div>
			</div>
		</div>
	)
}
