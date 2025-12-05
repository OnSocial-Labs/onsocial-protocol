'use client'

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { setupWalletSelector, WalletSelector } from '@near-wallet-selector/core'
import { setupModal, WalletSelectorModal } from '@near-wallet-selector/modal-ui'
import { setupHotWallet } from '@near-wallet-selector/hot-wallet'
import { setupHereWallet } from '@near-wallet-selector/here-wallet'
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet'
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet'
import { setupSender } from '@near-wallet-selector/sender'
import { setupNightly } from '@near-wallet-selector/nightly'
import { setupBitgetWallet } from '@near-wallet-selector/bitget-wallet'
import { setupBitteWallet } from '@near-wallet-selector/bitte-wallet'
import { setupCoin98Wallet } from '@near-wallet-selector/coin98-wallet'
import { setupLedger } from '@near-wallet-selector/ledger'
import { setupWalletConnect } from '@near-wallet-selector/wallet-connect'
// @ts-ignore - Near Snap has Node.js dependencies
import { setupNearSnap } from '@near-wallet-selector/near-snap'
import { setupMathWallet } from '@near-wallet-selector/math-wallet'
import { setupNarwallets } from '@near-wallet-selector/narwallets'
import { setupWelldoneWallet } from '@near-wallet-selector/welldone-wallet'
import { setupRamperWallet } from '@near-wallet-selector/ramper-wallet'
import { setupNearMobileWallet } from '@near-wallet-selector/near-mobile-wallet'
import { setupArepaWallet } from '@near-wallet-selector/arepa-wallet'
import { setupEthereumWallets } from '@near-wallet-selector/ethereum-wallets'
import { setupIntearWallet } from '@near-wallet-selector/intear-wallet'
import { setupMeteorWalletApp } from '@near-wallet-selector/meteor-wallet-app'
import { setupOKXWallet } from '@near-wallet-selector/okx-wallet'
import { setupUnityWallet } from '@near-wallet-selector/unity-wallet'
import { setupXDEFI } from '@near-wallet-selector/xdefi'
import '@near-wallet-selector/modal-ui/styles.css'

interface WalletContextType {
	selector: WalletSelector | null
	modal: WalletSelectorModal | null
	accounts: Array<{ accountId: string }>
	accountId: string | null
	isConnected: boolean
	isLoading: boolean
}

const WalletContext = createContext<WalletContextType>({
	selector: null,
	modal: null,
	accounts: [],
	accountId: null,
	isConnected: false,
	isLoading: true,
})

export function useWallet() {
	return useContext(WalletContext)
}

interface WalletProviderProps {
	children: ReactNode
	contractId?: string
	network?: 'testnet' | 'mainnet'
}

export function WalletProvider({
	children,
	contractId = 'core-onsocial.testnet',
	network = 'testnet',
}: WalletProviderProps) {
	const [selector, setSelector] = useState<WalletSelector | null>(null)
	const [modal, setModal] = useState<WalletSelectorModal | null>(null)
	const [accounts, setAccounts] = useState<Array<{ accountId: string }>>([])
	const [accountId, setAccountId] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		async function initWalletSelector() {
			try {
				const _selector = await setupWalletSelector({
					network,
					modules: [
						// Hot & Mobile Wallets (Most Popular)
						setupHotWallet(),
						setupMyNearWallet(),
						setupMeteorWallet(),
						setupSender(),
						setupHereWallet(),
						setupNearMobileWallet(),
						setupUnityWallet({
							projectId: 'c4f79cc821944d9680842e34466bfbad',
							metadata: {
								name: 'OnSocial Protocol',
								description: 'Decentralized Social Media Protocol on NEAR',
								url: 'https://onsocial.app',
								icons: ['https://onsocial.app/icon.png'],
							},
						}),
						setupMeteorWalletApp({ contractId }),
						
						// Multi-Chain & Advanced
						setupNightly(),
						setupWalletConnect({
							projectId: 'c4f79cc821944d9680842e34466bfbad',
							metadata: {
								name: 'OnSocial Protocol',
								description: 'Decentralized Social Media Protocol on NEAR',
								url: 'https://onsocial.app',
								icons: ['https://onsocial.app/icon.png'],
							},
						}),
						setupXDEFI(),
						
						// Injected Wallets
						setupBitgetWallet(),
						setupBitteWallet() as any,
						setupCoin98Wallet(),
						setupMathWallet(),
						setupNarwallets(),
						setupWelldoneWallet(),
						setupRamperWallet(),
						setupOKXWallet(),
						setupIntearWallet(),
						setupArepaWallet(),
						
						// Ethereum Wallets (MetaMask, etc.)
						// Note: setupEthereumWallets requires wagmiConfig - uncomment when configured
						// setupEthereumWallets({
						// 	wagmiConfig,
						// 	web3Modal,
						// }),
						
						// Hardware & Snap
						setupLedger(),
						setupNearSnap(),
					],
				})

				const _modal = setupModal(_selector, {
					contractId,
					description: 'Connect your NEAR wallet to test OnSocial Protocol on testnet',
				})

				const state = _selector.store.getState()
				setAccounts(state.accounts)
				setAccountId(state.accounts[0]?.accountId || null)

				setSelector(_selector)
				setModal(_modal)
			} catch (error) {
				console.error('Failed to initialize wallet selector:', error)
			} finally {
				setIsLoading(false)
			}
		}

		initWalletSelector()
	}, [contractId, network])

	useEffect(() => {
		if (!selector) return

		const subscription = selector.store.observable.subscribe((state) => {
			setAccounts(state.accounts)
			setAccountId(state.accounts[0]?.accountId || null)
		})

		return () => subscription.unsubscribe()
	}, [selector])

	const value: WalletContextType = {
		selector,
		modal,
		accounts,
		accountId,
		isConnected: !!accountId,
		isLoading,
	}

	return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
