'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Github } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { WalletButton } from '@/components/wallet-button'
import { cn } from '@/lib/utils'

const navItems = [
	{ label: 'Features', href: '#features', isAnchor: true },
	{ label: 'Roadmap', href: '#roadmap', isAnchor: true },
	{ label: 'Staking', href: '/staking', isAnchor: false },
	{ label: 'Playground', href: '/playground', isAnchor: false },
	{ label: 'Docs', href: '/docs', isAnchor: false },
]

// Pages that need wallet functionality
const WALLET_ROUTES = ['/staking', '/playground']

export function Navigation() {
	const [isOpen, setIsOpen] = useState(false)
	const pathname = usePathname()

	const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
		if (href.startsWith('#')) {
			e.preventDefault()

			// If we're not on the homepage, navigate there first
			if (window.location.pathname !== '/') {
				window.location.href = '/' + href
				setIsOpen(false)
				return
			}

			// If we're on homepage, scroll to the element
			const element = document.querySelector(href)
			if (element) {
				const offset = 80 // Account for fixed header
				const elementPosition = element.getBoundingClientRect().top
				const offsetPosition = elementPosition + window.pageYOffset - offset

				window.scrollTo({
					top: offsetPosition,
					behavior: 'smooth',
				})
				setIsOpen(false)
			}
		}
	}

	return (
		<motion.header
			initial={{ y: -100 }}
			animate={{ y: 0 }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
			className="fixed top-0 left-0 right-0 z-50 bg-background/70 backdrop-blur-2xl border-b border-border/40 shadow-lg shadow-primary/5"
		>
			<nav className="container mx-auto px-4 h-16 flex items-center justify-between">
				{/* Logo */}
				<Link
					href="/"
					onClick={(e) => {
						// If on homepage, scroll to top smoothly
						if (window.location.pathname === '/') {
							e.preventDefault()
							window.scrollTo({
								top: 0,
								behavior: 'smooth',
							})
						}
						setIsOpen(false)
					}}
					className="flex items-center space-x-2 group cursor-pointer"
				>
					<motion.div
						whileHover={{ scale: 1.05 }}
						whileTap={{ scale: 0.95 }}
						className="flex items-center space-x-2"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 279 271"
							className="w-8 h-8 transition-transform hover:scale-110 duration-300"
							fill="none"
						>
							<path
								className="fill-[#131313] dark:fill-white transition-colors"
								fillRule="evenodd"
								clipRule="evenodd"
								d="M 35.5,150.5 C 34.8459,144.19 34.3459,137.857 34,131.5C 33.6667,138.833 33.3333,146.167 33,153.5C 32.3012,148.719 31.8012,148.553 31.5,153C 31.5143,154.385 31.8476,155.551 32.5,156.5C 34.2871,167.648 37.6205,178.315 42.5,188.5C 42.1543,189.696 41.6543,189.696 41,188.5C 38.7422,182.354 35.7422,176.687 32,171.5C 16.6134,119.779 31.1134,78.6123 75.5,48C 98.3699,34.1188 123.037,29.4521 149.5,34C 198.634,40.4621 229.8,67.6288 243,115.5C 251.313,163.939 235.48,202.105 195.5,230C 155.243,252.531 116.577,250.198 79.5,223C 75.1424,218.063 70.6424,213.23 66,208.5C 63.3008,203.813 60.6341,199.147 58,194.5C 46.6082,181.826 39.1082,167.159 35.5,150.5 Z M 199.5,193.5 C 200.167,193.5 200.833,193.5 201.5,193.5C 202.167,193.5 202.5,193.833 202.5,194.5C 198.268,200.466 192.935,205.299 186.5,209C 181.802,211.349 177.136,213.682 172.5,216C 167.448,217.109 162.448,218.276 157.5,219.5C 155.326,219.92 153.326,219.92 151.5,219.5C 149.573,220.862 147.573,221.862 145.5,222.5C 144.167,222.5 142.833,222.5 141.5,222.5C 137.693,221.968 133.693,221.968 129.5,222.5C 115.754,222.031 103.754,217.364 93.5,208.5C 86.8076,202.808 80.8076,196.475 75.5,189.5C 74.4173,190.365 74.2506,191.365 75,192.5C 78.4153,195.745 81.2486,199.411 83.5,203.5C 83.1667,203.833 82.8333,204.167 82.5,204.5C 79.4926,201.135 76.4926,197.801 73.5,194.5C 71.3311,190.162 69.1644,185.829 67,181.5C 67.3736,186.455 69.2069,190.788 72.5,194.5C 72.6495,195.552 72.4828,196.552 72,197.5C 70,195.5 68,193.5 66,191.5C 65.5078,190.451 65.6744,189.451 66.5,188.5C 65.2338,187.276 64.0672,185.943 63,184.5C 61.8971,179.628 60.2304,174.962 58,170.5C 57.0447,159.102 55.8781,149.769 54.5,142.5C 55.9326,140.086 56.4326,137.419 56,134.5C 55.0617,136.488 54.2283,138.488 53.5,140.5C 53.9088,144.499 53.0754,148.166 51,151.5C 49.12,144.732 49.12,138.066 51,131.5C 51.3333,132.5 51.6667,133.5 52,134.5C 53.4617,115.927 60.1284,99.5937 72,85.5C 72.3333,86.1667 72.6667,86.8333 73,87.5C 76.5264,82.4609 80.5264,77.7942 85,73.5C 85.5613,74.0219 86.228,74.3552 87,74.5C 88.7384,72.2598 90.9051,70.5931 93.5,69.5C 94.779,70.7152 95.779,70.3818 96.5,68.5C 107.117,62.7551 118.45,59.4218 130.5,58.5C 134.035,59.221 137.535,58.8877 141,57.5C 142.154,59.9574 143.488,59.9574 145,57.5C 148.192,59.548 151.358,59.8813 154.5,58.5C 157.028,59.4978 157.028,60.3311 154.5,61C 172.591,64.6186 187.424,73.452 199,87.5C 202.333,92.8333 205.667,98.1667 209,103.5C 210.675,111.806 212.675,119.806 215,127.5C 216.036,139.605 215.369,151.605 213,163.5C 210.412,167.674 208.079,172.007 206,176.5C 201.564,183.6 196.397,190.1 190.5,196C 193.25,194.773 195.917,193.273 198.5,191.5C 198.351,190.448 198.517,189.448 199,188.5C 200.566,189.061 201.899,188.394 203,186.5C 202.421,188.992 201.254,191.325 199.5,193.5 Z"
							/>
						</svg>
						<span className="font-bold text-xl">OnSocial</span>
					</motion.div>
				</Link>

				{/* Desktop Navigation */}
				<div className="hidden md:flex items-center space-x-8">
					{navItems.map((item) => (
						<Link
							key={item.href}
							href={item.href}
							onClick={(e) => item.isAnchor && handleSmoothScroll(e, item.href)}
							className="text-muted-foreground hover:text-primary dark:hover:text-foreground transition-colors relative group"
						>
							{item.label}
							<span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary dark:bg-foreground group-hover:w-full transition-all duration-300" />
						</Link>
					))}
				</div>

				{/* Desktop Actions */}
				<div className="hidden md:flex items-center space-x-6">
					{/* Show wallet button only on specific pages */}
					{WALLET_ROUTES.some(route => pathname.startsWith(route)) && (
						<div className="flex items-center">
							<WalletButton />
						</div>
					)}
					<ThemeToggle />
					<Link
						href="https://github.com/OnSocial-Labs"
						target="_blank"
						className="text-muted-foreground hover:text-primary dark:hover:text-foreground transition-colors"
					>
						<Github className="h-5 w-5" />
					</Link>
					<Button asChild>
						<Link href="/docs">Get Started</Link>
					</Button>
				</div>

				{/* Mobile Menu Button */}
				<div className="flex md:hidden items-center space-x-2">
					<ThemeToggle />
					<button
						onClick={() => setIsOpen(!isOpen)}
						className="text-muted-foreground hover:text-primary dark:hover:text-foreground transition-colors relative"
					>
						<AnimatePresence mode="wait">
							{isOpen ? (
								<motion.div
									key="close"
									initial={{ rotate: -90, opacity: 0 }}
									animate={{ rotate: 0, opacity: 1 }}
									exit={{ rotate: 90, opacity: 0 }}
									transition={{ duration: 0.2 }}
								>
									<X className="h-5 w-5" />
								</motion.div>
							) : (
								<motion.div
									key="menu"
									initial={{ rotate: 90, opacity: 0 }}
									animate={{ rotate: 0, opacity: 1 }}
									exit={{ rotate: -90, opacity: 0 }}
									transition={{ duration: 0.2 }}
								>
									<Menu className="h-5 w-5" />
								</motion.div>
							)}
						</AnimatePresence>
					</button>
				</div>
			</nav>

			{/* Mobile Menu */}
			<AnimatePresence>
				{isOpen && (
					<>
						{/* Backdrop */}
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
							className="fixed inset-0 top-16 bg-background/80 backdrop-blur-xl md:hidden"
							onClick={() => setIsOpen(false)}
						/>

						{/* Menu */}
						<motion.div
							initial={{ opacity: 0, y: -20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -20 }}
							transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
							className="absolute top-16 left-0 right-0 bg-background border-b border-border md:hidden"
						>
							<div className="container mx-auto px-4 py-6 space-y-4">
								{navItems.map((item, i) => (
									<motion.div
										key={item.href}
										initial={{ opacity: 0, x: -20 }}
										animate={{ opacity: 1, x: 0 }}
										transition={{ delay: i * 0.05, duration: 0.3 }}
									>
										<Link
											href={item.href}
											onClick={(e) => {
												if (item.isAnchor) {
													handleSmoothScroll(e, item.href)
												} else {
													setIsOpen(false)
												}
											}}
											className="block text-lg font-medium hover:text-primary transition-colors py-2"
										>
											{item.label}
										</Link>
									</motion.div>
								))}
								<motion.div
									initial={{ opacity: 0, x: -20 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ delay: navItems.length * 0.05, duration: 0.3 }}
									className="pt-4 flex flex-col space-y-2"
								>
									{/* Show wallet button only on specific pages */}
									{WALLET_ROUTES.some(route => pathname.startsWith(route)) && (
										<div className="w-full mb-2">
											<WalletButton />
										</div>
									)}
									<Button asChild className="w-full">
										<Link href="/docs" onClick={() => setIsOpen(false)}>
											Get Started
										</Link>
									</Button>
									<Button
										variant="outline"
										asChild
										className="w-full"
									>
										<Link
											href="https://github.com/OnSocial-Labs"
											target="_blank"
											onClick={() => setIsOpen(false)}
										>
											<Github className="h-4 w-4 mr-2" />
											GitHub
										</Link>
									</Button>
								</motion.div>
							</div>
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</motion.header>
	)
}
