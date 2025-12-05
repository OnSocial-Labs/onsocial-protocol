'use client'

import { useState, useRef, useEffect } from 'react'
import { Wallet, ChevronDown, LogOut, RefreshCw, User, ExternalLink } from 'lucide-react'
import { useWallet } from '@/contexts/wallet-context'

export function WalletButton() {
	const { modal, accountId, isConnected, selector } = useWallet()
	const [showMenu, setShowMenu] = useState(false)
	const menuRef = useRef<HTMLDivElement>(null)

	// Close dropdown when clicking outside
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowMenu(false)
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])

	const handleDisconnect = async () => {
		if (selector) {
			const wallet = await selector.wallet()
			await wallet.signOut()
			setShowMenu(false)
		}
	}

	const handleSwitchWallet = () => {
		modal?.show()
		setShowMenu(false)
	}

	if (!isConnected) {
		return (
			<button
				onClick={() => modal?.show()}
				className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 text-sm"
			>
				<Wallet className="w-4 h-4" />
				<span className="hidden sm:inline">Connect Wallet</span>
			</button>
		)
	}

	return (
		<div className="relative" ref={menuRef}>
			<button
				onClick={() => setShowMenu(!showMenu)}
				className="flex items-center gap-2 bg-gray-100 dark:bg-[#1A1E23] rounded-lg px-3 py-2 border border-[#00ec96]/30 hover:border-[#00ec96]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#00ec96]/20"
			>
				<div className="flex items-center gap-2">
					<div className="w-2 h-2 bg-[#00ec96] rounded-full animate-pulse"></div>
					<Wallet className="w-4 h-4 text-[#00ec96]" />
					<span className="text-gray-900 dark:text-white text-sm font-medium max-w-[100px] truncate hidden sm:block">
						{accountId}
					</span>
				</div>
				<ChevronDown
					className={`w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform ${showMenu ? 'rotate-180' : ''}`}
				/>
			</button>

			{/* Dropdown Menu */}
			{showMenu && (
				<div className="absolute right-0 md:right-0 left-0 md:left-auto mt-2 w-full md:w-64 bg-white dark:bg-[#1A1E23] border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl z-50 overflow-hidden">
					<div className="p-3 border-b border-gray-200 dark:border-gray-800">
						<p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Connected Account</p>
						<p className="text-gray-900 dark:text-white text-sm font-medium truncate">{accountId}</p>
					</div>

					<div className="py-1">
						<button
							onClick={() => {
								window.open(`https://testnet.nearblocks.io/address/${accountId}`, '_blank')
								setShowMenu(false)
							}}
							className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-[#252525] transition-colors text-left"
						>
							<User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
							<span className="text-sm text-gray-700 dark:text-gray-300">View on Explorer</span>
							<ExternalLink className="w-3 h-3 text-gray-500 ml-auto" />
						</button>

						<button
							onClick={handleSwitchWallet}
							className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-[#252525] transition-colors text-left"
						>
							<RefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-400" />
							<span className="text-sm text-gray-700 dark:text-gray-300">Switch Wallet</span>
						</button>

						<div className="h-px bg-gray-200 dark:bg-gray-800 my-1"></div>

						<button
							onClick={handleDisconnect}
							className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-red-50 dark:hover:bg-red-600/10 transition-colors text-left"
						>
							<LogOut className="w-4 h-4 text-red-500" />
							<span className="text-sm text-red-500">Disconnect</span>
						</button>
					</div>
				</div>
			)}
		</div>
	)
}
