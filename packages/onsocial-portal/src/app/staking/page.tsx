'use client'

import { useState, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import {
	Coins,
	TrendingUp,
	Calendar,
	ArrowRight,
	CheckCircle2,
	Info,
	Lock,
} from 'lucide-react'
import { useWallet } from '@/contexts/wallet-context'

// ─── Lock Periods (from contract: VALID_LOCK_PERIODS) ────────
const LOCK_PERIODS = [
	{ months: 1, bonus: 10, label: '1 Month', color: '#6B7280' },
	{ months: 6, bonus: 10, label: '6 Months', color: '#3B82F6' },
	{ months: 12, bonus: 20, label: '12 Months', color: '#4ADE80', popular: true },
	{ months: 24, bonus: 35, label: '24 Months', color: '#A855F7' },
	{ months: 48, bonus: 50, label: '48 Months', color: '#F59E0B' },
]

export default function StakingPage() {
	const { isConnected, connect } = useWallet()
	const [selectedPeriod, setSelectedPeriod] = useState(2) // default 12 months
	const [stakeAmount, setStakeAmount] = useState('1000')
	const ref = useRef(null)
	const isInView = useInView(ref, { once: true, amount: 0.1 })

	const period = LOCK_PERIODS[selectedPeriod]
	const amount = parseFloat(stakeAmount) || 0
	const effectiveStake = amount * (1 + period.bonus / 100)

	const handleStake = () => {
		if (!isConnected) {
			connect()
		} else {
			alert('Staking functionality coming soon!')
		}
	}

	return (
		<div className="min-h-screen pt-24 pb-16">
			<div className="container mx-auto px-4 max-w-4xl">
				{/* Hero */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
					className="text-center mb-12"
				>
					<h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-[-0.03em]">
						Stake $SOCIAL
					</h1>
					<p className="text-lg text-muted-foreground max-w-xl mx-auto">
						Lock tokens, earn pro-rata rewards. Longer locks get higher effective stake.
					</p>
				</motion.div>

				{/* How It Works */}
				<motion.div
					ref={ref}
					initial={{ opacity: 0 }}
					animate={isInView ? { opacity: 1 } : {}}
					transition={{ duration: 0.5, delay: 0.1 }}
					className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-12 max-w-3xl mx-auto"
				>
					<div className="border border-border/50 rounded-2xl p-5 bg-muted/30">
						<div className="flex items-center gap-3 mb-2">
							<Lock className="w-4 h-4 text-[#3B82F6]" />
							<span className="text-sm font-medium">Lock Period</span>
						</div>
						<p className="text-xs text-muted-foreground">
							5 periods: 1, 6, 12, 24, or 48 months. Longer locks earn higher bonus on effective stake.
						</p>
					</div>
					<div className="border border-border/50 rounded-2xl p-5 bg-muted/30">
						<div className="flex items-center gap-3 mb-2">
							<TrendingUp className="w-4 h-4 text-[#4ADE80]" />
							<span className="text-sm font-medium">Pro-Rata Rewards</span>
						</div>
						<p className="text-xs text-muted-foreground">
							0.2% of the scheduled pool releases each week. Your share = your stake-seconds ÷ total.
						</p>
					</div>
					<div className="border border-border/50 rounded-2xl p-5 bg-muted/30">
						<div className="flex items-center gap-3 mb-2">
							<Coins className="w-4 h-4 text-[#A855F7]" />
							<span className="text-sm font-medium">Growing Pool</span>
						</div>
						<p className="text-xs text-muted-foreground">
							40% of every API credit purchase flows into the reward pool — more usage, more rewards.
						</p>
					</div>
				</motion.div>

				{/* Staking Interface */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={isInView ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.5, delay: 0.2 }}
					className="border border-border/50 rounded-2xl p-4 md:p-8 bg-muted/30"
				>
					{/* Lock Period Selector */}
					<div className="mb-8">
						<h3 className="text-lg font-semibold mb-4">Lock Period</h3>
						<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
							{LOCK_PERIODS.map((lp, index) => (
								<button
									key={lp.months}
									onClick={() => setSelectedPeriod(index)}
									className={`relative p-4 rounded-xl border transition-colors text-center ${
										selectedPeriod === index
											? 'border-border bg-muted/50'
											: 'border-border/50 hover:border-border bg-muted/30'
									}`}
								>
									{lp.popular && (
										<div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 border border-[#4ADE80]/40 bg-[#4ADE80]/[0.06] text-foreground rounded-full text-[10px] font-medium">
											Popular
										</div>
									)}
									<div className="text-sm font-semibold mb-1">{lp.label}</div>
									<div className="text-lg font-bold mb-0.5" style={{ color: lp.color }}>+{lp.bonus}%</div>
									<div className="text-[10px] text-muted-foreground">Effective Stake</div>
								</button>
							))}
						</div>
					</div>

					{/* Amount Input */}
					<div className="mb-8">
						<h3 className="text-lg font-semibold mb-4">Amount</h3>
						<div className="border border-border/50 rounded-xl p-4 md:p-6 bg-muted/30">
							<div className="flex items-center justify-between mb-4">
								<label className="text-sm text-muted-foreground">Amount to Stake</label>
								<span className="text-xs text-muted-foreground">Min: 0.01 $SOCIAL</span>
							</div>
							<div className="flex items-center gap-4 mb-4">
								<input
									type="number"
									value={stakeAmount}
									onChange={(e) => setStakeAmount(e.target.value)}
									placeholder="0.00"
									className="flex-1 min-w-0 bg-transparent text-2xl md:text-3xl font-bold outline-none tracking-[-0.02em]"
								/>
								<span className="text-base text-muted-foreground">$SOCIAL</span>
							</div>
						</div>
					</div>

					{/* Effective Stake Breakdown */}
					<div className="border border-border/50 rounded-xl p-4 md:p-6 bg-muted/30 mb-8">
						<h3 className="text-base font-semibold mb-4">Your Effective Stake</h3>
						<div className="space-y-3">
							<div className="flex justify-between items-center">
								<span className="text-sm text-muted-foreground">Locked Amount</span>
								<span className="text-base font-semibold truncate ml-2">
									{amount.toLocaleString()} $SOCIAL
								</span>
							</div>
							<div className="flex justify-between items-center">
								<span className="text-sm text-muted-foreground">
									Lock Bonus ({period.label})
								</span>
								<span className="text-base font-semibold truncate ml-2" style={{ color: period.color }}>
									+{period.bonus}%
								</span>
							</div>
							<div className="h-px bg-border/50" />
							<div className="flex justify-between items-center">
								<span className="font-semibold">Effective Stake</span>
								<span className="text-xl md:text-2xl font-bold tracking-[-0.02em] truncate ml-2">
									{effectiveStake.toLocaleString()} $SOCIAL
								</span>
							</div>
						</div>
						<div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
							<Calendar className="w-4 h-4 mt-0.5 flex-shrink-0" />
							<span>
								Unlock:{' '}
								{new Date(
									Date.now() + period.months * 30 * 24 * 60 * 60 * 1000,
								).toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'long',
									day: 'numeric',
								})}
							</span>
						</div>
						<div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
							<Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
							<span>
								Rewards accrue pro-rata: your effective-stake × time ÷ total. Actual APY depends on pool size and total stakers.
							</span>
						</div>
					</div>

					{/* Stake Button */}
					<button
						onClick={handleStake}
						disabled={!stakeAmount || amount < 0.01}
						className="w-full py-4 border border-[#3B82F6]/40 bg-[#3B82F6]/[0.06] text-foreground hover:border-[#3B82F6]/60 hover:shadow-md hover:shadow-[#3B82F6]/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-full font-semibold text-base transition-all flex items-center justify-center gap-2 group"
					>
						<Lock className="w-5 h-5" />
						{isConnected ? `Lock for ${period.label}` : 'Connect Wallet to Stake'}
						<ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
					</button>

					{/* Warning */}
					<div className="mt-4 flex items-start gap-2 p-4 border border-yellow-500/20 rounded-xl">
						<Info className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
						<div className="text-sm text-muted-foreground">
							<strong className="text-foreground">Important:</strong> Tokens are locked for the full period. You can extend but not shorten. Rewards are claimable anytime during the lock.
						</div>
					</div>
				</motion.div>

				{/* Contract Details */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={isInView ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.5, delay: 0.3 }}
					className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3"
				>
					<div className="border border-border/50 rounded-2xl p-6 bg-muted/30">
						<CheckCircle2 className="w-5 h-5 text-[#4ADE80] mb-3" />
						<h3 className="text-sm font-semibold mb-1">Continuous Release</h3>
						<p className="text-xs text-muted-foreground">
							0.2% of the scheduled pool releases every week using compound decay — rewards never run out abruptly.
						</p>
					</div>
					<div className="border border-border/50 rounded-2xl p-6 bg-muted/30">
						<CheckCircle2 className="w-5 h-5 text-[#3B82F6] mb-3" />
						<h3 className="text-sm font-semibold mb-1">On-Chain & Trustless</h3>
						<p className="text-xs text-muted-foreground">
							All staking logic runs on <span className="font-mono text-foreground/70">staking.onsocial.near</span>. Auto-register on first stake — no separate storage deposit.
						</p>
					</div>
				</motion.div>
			</div>
		</div>
	)
}
