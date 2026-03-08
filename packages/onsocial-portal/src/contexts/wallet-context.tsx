'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { NearConnector } from '@hot-labs/near-connect'
import type { NearWalletBase } from '@hot-labs/near-connect'

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

interface WalletContextType {
	/** The NearConnector instance (replaces old selector + modal). */
	connector: NearConnector | null
	/** The active wallet instance, if signed in. */
	wallet: NearWalletBase | null
	/** Convenience: signed-in account ID. */
	accountId: string | null
	/** True when a wallet is connected. */
	isConnected: boolean
	/** True while the connector is initialising / auto-connecting. */
	isLoading: boolean
	/** Open the wallet-selector popup (or reconnect). */
	connect: () => Promise<void>
	/** Disconnect the current wallet. */
	disconnect: () => Promise<void>
}

const WalletContext = createContext<WalletContextType>({
	connector: null,
	wallet: null,
	accountId: null,
	isConnected: false,
	isLoading: true,
	connect: async () => {},
	disconnect: async () => {},
})

export function useWallet() {
	return useContext(WalletContext)
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface WalletProviderProps {
	children: ReactNode
	network?: 'testnet' | 'mainnet'
}

export function WalletProvider({
	children,
	network = 'testnet',
}: WalletProviderProps) {
	const [wallet, setWallet] = useState<NearWalletBase | null>(null)
	const [accountId, setAccountId] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const connectorRef = useRef<NearConnector | null>(null)

	// ---- initialise connector once ----
	useEffect(() => {
		const connector = new NearConnector({
			network,
			footerBranding: {
				heading: 'OnSocial Protocol',
				link: 'https://onsocial.id',
				linkText: 'onsocial.id',
			},
		})
		connectorRef.current = connector

		// Listen for sign-in
		connector.on('wallet:signIn', async (t) => {
			try {
				const w = await connector.wallet()
				setWallet(w)
				setAccountId(t.accounts[0]?.accountId ?? null)
			} catch {
				// ignore
			}
		})

		// Listen for sign-out
		connector.on('wallet:signOut', () => {
			setWallet(null)
			setAccountId(null)
		})

		// Auto-connect (check if already signed in)
		;(async () => {
			try {
				const w = await connector.wallet()
				const accounts = await w.getAccounts()
				if (accounts.length > 0) {
					setWallet(w)
					setAccountId(accounts[0].accountId)
				}
			} catch {
				// not signed in – that's fine
			} finally {
				setIsLoading(false)
			}
		})()

		return () => {
			connector.removeAllListeners()
		}
	}, [network])

	// ---- actions ----
	const connect = useCallback(async () => {
		const c = connectorRef.current
		if (!c) return
		await c.connect()
	}, [])

	const disconnect = useCallback(async () => {
		const c = connectorRef.current
		if (!c) return
		await c.disconnect()
		setWallet(null)
		setAccountId(null)
	}, [])

	// ---- value ----
	const value: WalletContextType = {
		connector: connectorRef.current,
		wallet,
		accountId,
		isConnected: !!accountId,
		isLoading,
		connect,
		disconnect,
	}

	return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
