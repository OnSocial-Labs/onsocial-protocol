'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Coins, TrendingUp, Users, Calendar, Gift, ArrowRight, CheckCircle2, Info, Lock } from 'lucide-react'
import { useWallet } from '@/contexts/wallet-context'

const STAKING_TIERS = [
	{
		duration: 6,
		multiplier: 1.0,
		label: '6 Months',
		emoji: '⚡',
		highlight: false,
	},
	{
		duration: 12,
		multiplier: 1.5,
		label: '12 Months',
		emoji: '🚀',
		highlight: true,
	},
	{
		duration: 48,
		multiplier: 2.0,
		label: '48 Months',
		emoji: '💎',
		highlight: false,
	},
]

export default function StakingPage() {
	const { isConnected, modal } = useWallet()
	const [selectedTier, setSelectedTier] = useState(1) // Default to 12 months
	const [stakeAmount, setStakeAmount] = useState('1000')

	const calculateRewards = () => {
		const amount = parseFloat(stakeAmount) || 0
		const tier = STAKING_TIERS[selectedTier]
		const rewards = amount * tier.multiplier
		const total = amount + rewards
		return { rewards, total }
	}

	const { rewards, total } = calculateRewards()
	const selectedDuration = STAKING_TIERS[selectedTier]

	const handleStake = () => {
		if (!isConnected) {
			modal?.show()
		} else {
			// TODO: Implement staking logic
			alert('Staking functionality coming soon!')
		}
	}

	return (
		<div className="min-h-screen bg-gray-50 dark:bg-[#131313] pt-24 pb-16">
			<div className="container mx-auto px-4">
				{/* Hero Section */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
					className="text-center mb-16"
				>
					<h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-[#00ec96] to-[#A05CFF] bg-clip-text text-transparent">
						Stake $SOCIAL
					</h1>
					<p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-4">
						Support OnSocial Protocol and earn rewards. First 1,000 stakers get bonus multipliers!
					</p>
					<div className="inline-flex items-center gap-2 px-4 py-2 bg-[#00ec96]/10 border border-[#00ec96]/30 rounded-full text-[#00ec96] text-sm font-medium">
						<Gift className="w-4 h-4" />
						Early Supporter Program Active
					</div>
				</motion.div>

			{/* Stats Cards */}
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 1, delay: 0.3 }}
				className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
			>
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 1, delay: 0.4 }}
					className="group bg-white dark:bg-[#1A1E23] rounded-xl p-6 border border-gray-200 dark:border-gray-800 hover:border-[#00ec96]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[#00ec96]/10"
				>
					<div className="flex items-center gap-3 mb-2">
						<div className="p-2 bg-[#00ec96]/10 rounded-lg">
							<Coins className="w-5 h-5 text-[#00ec96] group-hover:scale-110 transition-transform duration-300" />
						</div>
						<h3 className="text-gray-600 dark:text-gray-400 text-sm">Total Staked</h3>
					</div>
					<p className="text-3xl font-bold text-gray-900 dark:text-white">5.2M $SOCIAL</p>
					<p className="text-sm text-gray-500 mt-1">~$2.6M USD</p>
				</motion.div>

				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 1, delay: 0.5 }}
					className="group bg-white dark:bg-[#1A1E23] rounded-xl p-6 border border-gray-200 dark:border-gray-800 hover:border-[#A05CFF]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[#A05CFF]/10"
				>
					<div className="flex items-center gap-3 mb-2">
						<div className="p-2 bg-[#A05CFF]/10 rounded-lg">
							<Users className="w-5 h-5 text-[#A05CFF] group-hover:scale-110 transition-transform duration-300" />
						</div>
						<h3 className="text-gray-600 dark:text-gray-400 text-sm">Stakers</h3>
					</div>
					<p className="text-3xl font-bold text-gray-900 dark:text-white">237 / 1,000</p>
					<div className="mt-2 w-full bg-gray-300 dark:bg-gray-800 rounded-full h-2">
						<div className="bg-gradient-to-r from-[#00ec96] to-[#A05CFF] h-2 rounded-full" style={{ width: '23.7%' }}></div>
					</div>
				</motion.div>

				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 1, delay: 0.6 }}
					className="group bg-white dark:bg-[#1A1E23] rounded-xl p-6 border border-gray-200 dark:border-gray-800 hover:border-[#00ec96]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[#00ec96]/10"
				>
					<div className="flex items-center gap-3 mb-2">
						<div className="p-2 bg-[#00ec96]/10 rounded-lg">
							<TrendingUp className="w-5 h-5 text-[#00ec96] group-hover:scale-110 transition-transform duration-300" />
						</div>
						<h3 className="text-gray-600 dark:text-gray-400 text-sm">Est. APY</h3>
					</div>
					<p className="text-3xl font-bold text-gray-900 dark:text-white">50-100%</p>
					<p className="text-sm text-gray-500 mt-1">Based on tier</p>
				</motion.div>
			</motion.div>

			{/* Main Staking Interface */}
				<div className="max-w-4xl mx-auto">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.4 }}
						className="bg-white dark:bg-[#1A1E23] rounded-2xl p-8 border border-gray-200 dark:border-gray-800"
					>
						{/* Tier Selector */}
						<div className="mb-8">
							<h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Choose Staking Period</h2>
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								{STAKING_TIERS.map((tier, index) => (
									<button
										key={index}
										onClick={() => setSelectedTier(index)}
										className={`relative p-6 rounded-xl border-2 transition-all ${
											selectedTier === index
												? 'border-[#00ec96] bg-[#00ec96]/5'
												: 'border-gray-300 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-700'
										} ${tier.highlight ? 'ring-2 ring-[#A05CFF]/30' : ''}`}
									>
										{tier.highlight && (
											<div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-[#00ec96] to-[#A05CFF] rounded-full text-xs font-semibold text-white">
												Popular
											</div>
										)}
										<div className="text-4xl mb-2">{tier.emoji}</div>
										<div className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{tier.label}</div>
										<div className="text-2xl font-bold text-[#00ec96] mb-2">{tier.multiplier}:1</div>
										<div className="text-sm text-gray-600 dark:text-gray-400">Reward Multiplier</div>
									</button>
								))}
							</div>
						</div>

						{/* Staking Calculator */}
						<div className="mb-8">
							<h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Stake Amount</h2>
							<div className="bg-white dark:bg-[#131313] rounded-xl p-6 border border-gray-300 dark:border-gray-800">
								<div className="flex items-center justify-between mb-4">
									<label className="text-gray-600 dark:text-gray-400 text-sm">Amount to Stake</label>
									<span className="text-gray-600 dark:text-gray-400 text-sm">Balance: 10,000 $SOCIAL</span>
								</div>
								<div className="flex items-center gap-4 mb-6">
									<input
										type="number"
										value={stakeAmount}
										onChange={(e) => setStakeAmount(e.target.value)}
										placeholder="0.00"
										className="flex-1 bg-transparent text-3xl font-bold text-gray-900 dark:text-white outline-none"
									/>
									<span className="text-xl text-gray-600 dark:text-gray-400">$SOCIAL</span>
								</div>
								<div className="flex gap-2">
									<button
										onClick={() => setStakeAmount('1000')}
										className="px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-900 dark:text-white transition-colors"
									>
										1K
									</button>
									<button
										onClick={() => setStakeAmount('5000')}
										className="px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-900 dark:text-white transition-colors"
									>
										5K
									</button>
									<button
										onClick={() => setStakeAmount('10000')}
										className="px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-900 dark:text-white transition-colors"
									>
										MAX
									</button>
								</div>
							</div>
						</div>

						{/* Rewards Breakdown */}
						<div className="bg-gradient-to-br from-[#00ec96]/10 to-[#A05CFF]/10 rounded-xl p-6 border border-[#00ec96]/30 mb-8">
							<h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">You'll Receive</h3>
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<span className="text-gray-600 dark:text-gray-400">Original Stake</span>
									<span className="text-xl font-semibold text-gray-900 dark:text-white">{stakeAmount || '0'} $SOCIAL</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-gray-600 dark:text-gray-400">Rewards ({selectedDuration.multiplier}:1)</span>
									<span className="text-xl font-semibold text-[#00ec96]">+{rewards.toLocaleString()} $SOCIAL</span>
								</div>
								<div className="h-px bg-gray-300 dark:bg-gray-800"></div>
								<div className="flex justify-between items-center">
									<span className="text-gray-900 dark:text-white font-semibold">Total at Unlock</span>
									<span className="text-2xl font-bold bg-gradient-to-r from-[#00ec96] to-[#A05CFF] bg-clip-text text-transparent">
										{total.toLocaleString()} $SOCIAL
									</span>
								</div>
							</div>
							<div className="mt-4 flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
								<Calendar className="w-4 h-4 mt-0.5 flex-shrink-0" />
								<span>
									Unlock Date: {new Date(Date.now() + selectedDuration.duration * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
								</span>
							</div>
						</div>

					{/* Stake Button */}
					<button
						onClick={handleStake}
						disabled={!stakeAmount || parseFloat(stakeAmount) <= 0}
						className="w-full py-4 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-2 group"
					>
						<Lock className="w-5 h-5" />
						{isConnected ? 'Stake Now' : 'Connect Wallet to Stake'}
						<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
					</button>						{/* Warning */}
						<div className="mt-4 flex items-start gap-2 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
							<Info className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
							<div className="text-sm text-yellow-900 dark:text-yellow-200">
								<strong>Important:</strong> Staked tokens are locked for the selected period. Early withdrawal will forfeit all rewards.
							</div>
						</div>
					</motion.div>

					{/* Benefits Section */}
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.5 }}
						className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6"
					>
						<div className="bg-white dark:bg-[#1A1E23] rounded-xl p-6 border border-gray-200 dark:border-gray-800">
							<CheckCircle2 className="w-8 h-8 text-[#00ec96] mb-4" />
							<h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Bonus Rewards</h3>
							<p className="text-gray-600 dark:text-gray-400 text-sm">
								First 1,000 stakers receive enhanced reward multipliers. Join early to maximize your returns!
							</p>
						</div>
						<div className="bg-white dark:bg-[#1A1E23] rounded-xl p-6 border border-gray-200 dark:border-gray-800">
							<CheckCircle2 className="w-8 h-8 text-[#00ec96] mb-4" />
							<h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Secure & Trustless</h3>
							<p className="text-gray-600 dark:text-gray-400 text-sm">
								All staking is managed by audited smart contracts on NEAR blockchain. Your tokens remain in your control.
							</p>
						</div>
					</motion.div>
				</div>
			</div>
		</div>
	)
}
