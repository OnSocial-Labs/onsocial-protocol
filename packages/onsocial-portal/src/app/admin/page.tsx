'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useWallet } from '@/contexts/wallet-context'
import type { NearWalletBase } from '@hot-labs/near-connect'
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Key,
  Link2,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PulsingDots } from '@/components/ui/pulsing-dots'
import {
  viewContract,
  yoctoToSocial,
  socialToYocto,
  REWARDS_CONTRACT,
  type OnChainAppConfig,
} from '@/lib/near-rpc'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Admin wallet addresses — client-side gate (server also validates).
const ADMIN_WALLETS = (
  process.env.NEXT_PUBLIC_ADMIN_WALLETS ??
    'onsocial.near,onsocial.testnet,greenghost.near,test01greenghost.testnet'
)
  .split(',')
  .map((w) => w.trim().toLowerCase())

// Contract owner wallets — only these can call register_app on-chain
const CONTRACT_OWNER_WALLETS = ['onsocial.testnet', 'onsocial.near']

const RELAYER_ACCOUNT =
  process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
    ? 'relayer.onsocial.near'
    : 'relayer.onsocial.testnet'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Application {
  app_id: string
  label: string
  status: string
  wallet_id: string | null
  description: string | null
  expected_users: string | null
  contact: string | null
  admin_notes: string | null
  created_at: string
  reviewed_at: string | null
}

// ---------------------------------------------------------------------------
// API helpers — calls Next.js server route which injects ADMIN_SECRET
// ---------------------------------------------------------------------------

async function fetchApplications(wallet: string): Promise<Application[]> {
  const res = await fetch(`/api/admin?wallet=${encodeURIComponent(wallet)}`)
  if (!res.ok) throw new Error('Failed to fetch applications')
  const data = (await res.json()) as { success: boolean; applications: Application[] }
  return data.applications
}

async function approveApp(
  wallet: string,
  appId: string,
  notes: string,
): Promise<{ api_key: string }> {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, action: 'approve', appId, admin_notes: notes }),
  })
  if (!res.ok) throw new Error('Approval failed')
  return (await res.json()) as { api_key: string }
}

async function rejectApp(
  wallet: string,
  appId: string,
  notes: string,
): Promise<void> {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, action: 'reject', appId, admin_notes: notes }),
  })
  if (!res.ok) throw new Error('Rejection failed')
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
    pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', icon: Clock },
    approved: { bg: 'bg-[#4ADE80]/10', text: 'text-[#4ADE80]', icon: CheckCircle2 },
    rejected: { bg: 'bg-red-400/10', text: 'text-red-400', icon: XCircle },
  }
  const s = styles[status] ?? styles.pending
  const Icon = s.icon

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Clean numeric input — strip spaces, commas, non-numeric (except '.')
// ---------------------------------------------------------------------------

function cleanNumeric(raw: string): string {
  // Strip anything that isn't a digit or decimal point
  let cleaned = raw.replace(/[^0-9.]/g, '')
  // Allow only one decimal point — keep first, remove rest
  const dotIdx = cleaned.indexOf('.')
  if (dotIdx !== -1) {
    cleaned = cleaned.slice(0, dotIdx + 1) + cleaned.slice(dotIdx + 1).replace(/\./g, '')
  }
  return cleaned
}

// Normalize on blur: .2 → 0.2, 08 → 8, 5. → 5, empty → 0
function normalizeNumeric(raw: string): string {
  if (!raw || raw === '.') return '0'
  const n = parseFloat(raw)
  if (isNaN(n)) return '0'
  // Use String(n) to strip leading zeros and trailing dot, but preserve meaningful decimals
  return String(n)
}

// ---------------------------------------------------------------------------
// Contract param input
// ---------------------------------------------------------------------------

function ParamField({
  label,
  hint,
  value,
  onChange,
  suffix,
  error,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  suffix?: string
  error?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(cleanNumeric(e.target.value))}
          onBlur={() => onChange(normalizeNumeric(value))}
          className={`flex-1 px-3 py-1.5 rounded-lg bg-muted/40 border outline-none transition-colors text-sm font-mono ${
            error ? 'border-red-400 focus:border-red-400' : 'border-border/50 focus:border-[#60A5FA]'
          }`}
        />
        {suffix && <span className="text-xs text-muted-foreground whitespace-nowrap">{suffix}</span>}
      </div>
      {error ? (
        <p className="text-[11px] text-red-400 mt-0.5">{error}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{hint}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ParamErrors {
  rewardPerAction?: string
  dailyCap?: string
  totalBudget?: string
  dailyBudget?: string
}

function validateParams(vals: {
  rewardPerAction: string
  dailyCap: string
  totalBudget: string
  dailyBudget: string
}): ParamErrors {
  const errs: ParamErrors = {}
  const rpa = parseFloat(vals.rewardPerAction)
  const dc = parseFloat(vals.dailyCap)
  const tb = parseFloat(vals.totalBudget)
  const db = parseFloat(vals.dailyBudget)

  // Contract caps (human-readable SOCIAL amounts)
  const MAX_RPA = 1     // 1 SOCIAL
  const MAX_DC = 10     // 10 SOCIAL

  if (isNaN(rpa) || rpa < 0) errs.rewardPerAction = 'Must be a number ≥ 0'
  else if (rpa === 0) errs.rewardPerAction = 'Must be > 0 (users earn nothing otherwise)'
  else if (rpa > MAX_RPA) errs.rewardPerAction = `Max ${MAX_RPA} SOCIAL per action`

  if (isNaN(dc) || dc < 0) errs.dailyCap = 'Must be a number ≥ 0'
  else if (dc === 0) errs.dailyCap = 'Must be > 0 (users hit cap immediately)'
  else if (dc > MAX_DC) errs.dailyCap = `Max ${MAX_DC} SOCIAL per user per day`
  else if (rpa > 0 && dc > 0 && rpa > dc) errs.dailyCap = 'Must be ≥ reward_per_action'

  if (isNaN(tb) || tb < 0) errs.totalBudget = 'Must be a number ≥ 0'
  else if (tb === 0) errs.totalBudget = 'Required — every app needs a lifetime cap'
  if (isNaN(db) || db < 0) errs.dailyBudget = 'Must be a number ≥ 0'

  return errs
}

function hasErrors(errs: ParamErrors): boolean {
  return Object.keys(errs).length > 0
}

// ---------------------------------------------------------------------------
// Application Card
// ---------------------------------------------------------------------------

function AppCard({
  app,
  wallet,
  walletInstance,
  onUpdate,
}: {
  app: Application
  wallet: string
  walletInstance: NearWalletBase | null
  onUpdate: () => void
}) {
  const [notes, setNotes] = useState(app.admin_notes ?? '')
  const [acting, setActing] = useState(false)
  const [result, setResult] = useState<{ type: 'approved'; apiKey: string } | null>(null)
  const [chainStatus, setChainStatus] = useState<'idle' | 'registering' | 'done' | 'error' | 'skipped'>('idle')
  const [chainError, setChainError] = useState('')
  const [error, setError] = useState('')

  // On-chain config for approved apps
  const [onChainConfig, setOnChainConfig] = useState<OnChainAppConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(false)

  // Fetch on-chain config for approved apps
  useEffect(() => {
    if (app.status !== 'approved') return
    setConfigLoading(true)
    viewContract<OnChainAppConfig>('get_app_config', { app_id: app.app_id })
      .then((cfg) => setOnChainConfig(cfg))
      .catch(() => {})
      .finally(() => setConfigLoading(false))
  }, [app.status, app.app_id])

  // Contract params — configurable (human-readable SOCIAL amounts)
  const [dailyCap, setDailyCap] = useState('1')
  const [rewardPerAction, setRewardPerAction] = useState('0.1')
  const [totalBudget, setTotalBudget] = useState('10000')
  const [dailyBudget, setDailyBudget] = useState('0')
  const [paramErrors, setParamErrors] = useState<ParamErrors>({})

  const isContractOwner = CONTRACT_OWNER_WALLETS.includes(wallet.toLowerCase())

  const handleApproveAndRegister = async () => {
    // Validate contract params before doing anything
    if (isContractOwner) {
      const errs = validateParams({ rewardPerAction, dailyCap, totalBudget, dailyBudget })
      setParamErrors(errs)
      if (hasErrors(errs)) return
    }

    setActing(true)
    setError('')
    try {
      // Step 1: DB approval — generates API key
      const data = await approveApp(wallet, app.app_id, notes)
      setResult({ type: 'approved', apiKey: data.api_key })

      // Step 2: On-chain registration (owner only)
      if (walletInstance && isContractOwner) {
        setChainStatus('registering')

        await walletInstance.signAndSendTransaction({
          receiverId: REWARDS_CONTRACT,
          actions: [
            {
              type: 'FunctionCall',
              params: {
                methodName: 'register_app',
                args: {
                  config: {
                    app_id: app.app_id,
                    label: app.label,
                    daily_cap: socialToYocto(dailyCap),
                    reward_per_action: socialToYocto(rewardPerAction),
                    authorized_callers: [RELAYER_ACCOUNT],
                    total_budget: socialToYocto(totalBudget),
                    daily_budget: socialToYocto(dailyBudget),
                  },
                },
                gas: '30000000000000',
                deposit: '0',
              },
            },
          ],
        })
        setChainStatus('done')
      } else {
        setChainStatus('skipped')
      }
      onUpdate()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed'
      if (result) {
        // DB succeeded but chain failed
        setChainError(msg)
        setChainStatus('error')
      } else {
        setError(msg)
      }
    } finally {
      setActing(false)
    }
  }

  const retryOnChain = async () => {
    const errs = validateParams({ rewardPerAction, dailyCap, totalBudget, dailyBudget })
    setParamErrors(errs)
    if (hasErrors(errs)) return

    setChainStatus('registering')
    setChainError('')
    try {
      if (!walletInstance) throw new Error('No wallet connected')

      await walletInstance.signAndSendTransaction({
        receiverId: REWARDS_CONTRACT,
        actions: [
          {
            type: 'FunctionCall',
            params: {
              methodName: 'register_app',
              args: {
                config: {
                  app_id: app.app_id,
                  label: app.label,
                  daily_cap: socialToYocto(dailyCap),
                  reward_per_action: socialToYocto(rewardPerAction),
                  authorized_callers: [RELAYER_ACCOUNT],
                  total_budget: socialToYocto(totalBudget),
                  daily_budget: socialToYocto(dailyBudget),
                },
              },
              gas: '30000000000000',
              deposit: '0',
            },
          },
        ],
      })
      setChainStatus('done')
    } catch (e) {
      setChainError(e instanceof Error ? e.message : 'On-chain registration failed')
      setChainStatus('error')
    }
  }

  const handleReject = async () => {
    setActing(true)
    setError('')
    try {
      await rejectApp(wallet, app.app_id, notes)
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="border border-border/50 rounded-2xl p-6 bg-muted/30">
      {/* Header: app name + status */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-semibold tracking-[-0.02em]">{app.label}</h3>
          <p className="text-sm text-muted-foreground font-mono">{app.app_id}</p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      {/* Application details */}
      <div className="space-y-2 text-sm mb-4">
        {app.wallet_id && (
          <p>
            <span className="text-muted-foreground">Wallet:</span>{' '}
            <span className="font-mono text-[#4ADE80]">{app.wallet_id}</span>
          </p>
        )}
        {app.description && (
          <p>
            <span className="text-muted-foreground">Description:</span> {app.description}
          </p>
        )}
        {app.expected_users && (
          <p>
            <span className="text-muted-foreground">Expected users:</span> {app.expected_users}
          </p>
        )}
        {app.contact && (
          <p>
            <span className="text-muted-foreground">Contact:</span> {app.contact}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Applied: {new Date(app.created_at).toLocaleDateString()}
          {app.reviewed_at && ` · Reviewed: ${new Date(app.reviewed_at).toLocaleDateString()}`}
        </p>
      </div>

      {/* Pending: show contract params + approve/reject */}
      {app.status === 'pending' && !result && (
        <>
          {/* Read-only contract fields */}
          <div className="border border-[#C084FC]/15 rounded-xl p-4 bg-[#C084FC]/[0.02] mb-4">
            <p className="text-xs font-semibold text-[#C084FC] mb-3 uppercase tracking-wider">
              Contract Registration · {REWARDS_CONTRACT}
            </p>

            {/* Locked fields */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">app_id</span>
                <p className="font-mono text-foreground">{app.app_id}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">label</span>
                <p className="text-foreground">{app.label}</p>
              </div>
            </div>

            {/* Configurable fields */}
            {isContractOwner && (
              <div className="space-y-3 pt-3 border-t border-border/30">
                <div className="grid grid-cols-2 gap-3">
                  <ParamField
                    label="reward_per_action"
                    hint="SOCIAL tokens per reward action"
                    value={rewardPerAction}
                    onChange={(v) => { setRewardPerAction(v); setParamErrors(validateParams({ rewardPerAction: v, dailyCap, totalBudget, dailyBudget })) }}
                    suffix="SOCIAL"
                    error={paramErrors.rewardPerAction}
                  />
                  <ParamField
                    label="daily_cap"
                    hint="Max SOCIAL a user can earn per day"
                    value={dailyCap}
                    onChange={(v) => { setDailyCap(v); setParamErrors(validateParams({ rewardPerAction, dailyCap: v, totalBudget, dailyBudget })) }}
                    suffix="SOCIAL"
                    error={paramErrors.dailyCap}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ParamField
                    label="total_budget"
                    hint="Lifetime token budget for this app (required)"
                    value={totalBudget}
                    onChange={(v) => { setTotalBudget(v); setParamErrors(validateParams({ rewardPerAction, dailyCap, totalBudget: v, dailyBudget })) }}
                    suffix="SOCIAL"
                    error={paramErrors.totalBudget}
                  />
                  <ParamField
                    label="daily_budget"
                    hint="Aggregate daily budget (0 = unlimited)"
                    value={dailyBudget}
                    onChange={(v) => { setDailyBudget(v); setParamErrors(validateParams({ rewardPerAction, dailyCap, totalBudget, dailyBudget: v })) }}
                    suffix="SOCIAL"
                    error={paramErrors.dailyBudget}
                  />
                </div>

                {/* Auto-set authorized caller */}
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">authorized_callers:</span>{' '}
                  <span className="font-mono text-[#60A5FA]">{RELAYER_ACCOUNT}</span>
                  <span className="text-muted-foreground/60 ml-1">(relayer — auto-set)</span>
                </div>
              </div>
            )}

            {!isContractOwner && (
              <p className="text-xs text-yellow-500/80 mt-2">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Connect as <span className="font-mono text-[#C084FC]">onsocial.testnet</span> to configure & register on-chain.
              </p>
            )}
          </div>

          {/* Admin notes */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Admin Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              rows={2}
              className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border/50 focus:border-border outline-none transition-colors text-sm resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

          <div className="flex gap-2">
            <Button
              onClick={handleApproveAndRegister}
              disabled={acting}
              size="sm"
              className="font-semibold"
            >
              {acting ? (
                <PulsingDots size="sm" className="mr-1.5" />
              ) : (
                <CheckCircle2 className="w-3 h-3 mr-1.5" />
              )}
              {isContractOwner ? 'Approve & Register On-Chain' : 'Approve'}
            </Button>
            <Button
              onClick={handleReject}
              disabled={acting}
              size="sm"
              variant="outline"
              className="font-semibold text-red-400 hover:text-red-300"
            >
              <XCircle className="w-3 h-3 mr-1.5" />
              Reject
            </Button>
          </div>
        </>
      )}

      {/* Post-approval: API key */}
      {result && (
        <div className="border border-[#4ADE80]/20 rounded-xl p-4 bg-[#4ADE80]/[0.03] mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Key className="w-4 h-4 text-[#4ADE80]" />
            <span className="text-sm font-semibold">API Key Generated</span>
          </div>
          <code className="block text-xs font-mono text-[#4ADE80] break-all">
            {result.apiKey}
          </code>
          <p className="text-xs text-yellow-500/80 mt-1">
            Share this with the partner securely.
          </p>
        </div>
      )}

      {/* On-chain status */}
      {chainStatus === 'registering' && (
        <div className="border border-[#60A5FA]/20 rounded-xl p-4 bg-[#60A5FA]/[0.03] mb-4">
          <div className="flex items-center gap-2">
            <PulsingDots size="md" className="text-[#60A5FA]" />
            <span className="text-sm">Registering on <span className="font-mono">{REWARDS_CONTRACT}</span>…</span>
          </div>
        </div>
      )}
      {chainStatus === 'done' && (
        <div className="border border-[#4ADE80]/20 rounded-xl p-4 bg-[#4ADE80]/[0.03] mb-4">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[#4ADE80]" />
            <span className="text-sm font-semibold">Registered on-chain</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-mono">{app.app_id}</span> registered on <span className="font-mono">{REWARDS_CONTRACT}</span>
          </p>
        </div>
      )}
      {chainStatus === 'error' && (
        <div className="border border-red-400/20 rounded-xl p-4 bg-red-400/[0.03] mb-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold">On-chain registration failed</span>
          </div>
          <p className="text-xs text-red-400">{chainError}</p>
          <Button onClick={retryOnChain} size="sm" variant="outline" className="mt-2 text-xs">
            Retry On-Chain Registration
          </Button>
        </div>
      )}
      {chainStatus === 'skipped' && (
        <div className="border border-yellow-500/20 rounded-xl p-4 bg-yellow-500/[0.03] mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-semibold">On-chain registration needed</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Connect as <span className="font-mono text-[#C084FC]">onsocial.testnet</span> to register <span className="font-mono">{app.app_id}</span> on the rewards contract.
          </p>
        </div>
      )}

      {/* On-chain config for approved apps */}
      {app.status === 'approved' && (
        <div className="border border-[#C084FC]/15 rounded-xl p-4 bg-[#C084FC]/[0.02] mt-4">
          <p className="text-xs font-semibold text-[#C084FC] mb-3 uppercase tracking-wider">
            On-Chain Config · {REWARDS_CONTRACT}
          </p>
          {configLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <PulsingDots size="sm" /> Loading…
            </div>
          )}
          {!configLoading && !onChainConfig && (
            <p className="text-xs text-yellow-500/80">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              Not registered on-chain yet.
            </p>
          )}
          {!configLoading && onChainConfig && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Reward / Action</span>
                <p className="font-mono text-foreground">{yoctoToSocial(onChainConfig.reward_per_action)} SOCIAL</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Daily Cap / User</span>
                <p className="font-mono text-foreground">{yoctoToSocial(onChainConfig.daily_cap)} SOCIAL</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Total Budget</span>
                <p className="font-mono text-foreground">{yoctoToSocial(onChainConfig.total_budget)} SOCIAL</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Daily Budget</span>
                <p className="font-mono text-foreground">{yoctoToSocial(onChainConfig.daily_budget) === '0' ? 'Unlimited' : `${yoctoToSocial(onChainConfig.daily_budget)} SOCIAL`}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Total Credited</span>
                <p className="font-mono text-foreground">{yoctoToSocial(onChainConfig.total_credited)} SOCIAL</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Callers</span>
                <p className="font-mono text-foreground text-xs break-all">{onChainConfig.authorized_callers.join(', ') || '—'}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const { accountId, wallet: walletInstance, connect } = useWallet()
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')

  const isAdmin = accountId && ADMIN_WALLETS.includes(accountId.toLowerCase())

  const loadApps = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchApplications(accountId)
      setApps(data)
    } catch {
      setError('Failed to load applications.')
    } finally {
      setLoading(false)
    }
  }, [accountId])

  // Auto-load when admin connects wallet
  useEffect(() => {
    if (isAdmin) {
      loadApps()
    }
  }, [isAdmin, loadApps])

  const filtered = filter === 'all' ? apps : apps.filter((a) => a.status === filter)
  const counts = {
    all: apps.length,
    pending: apps.filter((a) => a.status === 'pending').length,
    approved: apps.filter((a) => a.status === 'approved').length,
    rejected: apps.filter((a) => a.status === 'rejected').length,
  }

  // Gate: not connected
  if (!accountId) {
    return (
      <div className="min-h-screen pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
          <h1 className="text-3xl font-bold mb-4 tracking-[-0.03em]">Admin Panel</h1>
          <p className="text-muted-foreground mb-6">Connect your admin wallet to continue.</p>
          <Button onClick={() => connect()} size="lg" className="font-semibold px-8">
            Connect Wallet
          </Button>
        </div>
      </div>
    )
  }

  // Gate: not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <XCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
          <h1 className="text-3xl font-bold mb-4 tracking-[-0.03em]">Access Denied</h1>
          <p className="text-muted-foreground">
            <span className="font-mono text-foreground">{accountId}</span> is not an admin wallet.
          </p>
        </div>
      </div>
    )
  }

  // Admin dashboard — loads automatically
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold tracking-[-0.03em]">Partner Applications</h1>
            <Button onClick={loadApps} disabled={loading} size="sm" variant="outline">
              {loading ? <PulsingDots size="sm" /> : 'Refresh'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="text-[#4ADE80] font-mono">{accountId}</span> · {apps.length} total applications
          </p>
          {error && (
            <p className="text-sm text-red-400 mt-2">{error}</p>
          )}
        </motion.div>

        {/* Filter tabs */}
        <div className="flex gap-1 p-1 border border-border/50 rounded-full mb-6 max-w-md bg-muted/30">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 px-3 py-2 rounded-full text-sm font-medium transition-colors capitalize ${
                filter === f
                  ? 'bg-muted/80 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>

        {/* Application list */}
        {loading && (
          <div className="text-center py-12 text-[#60A5FA]">
            <PulsingDots size="lg" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 border border-border/50 rounded-2xl bg-muted/30">
            <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground">No {filter === 'all' ? '' : filter} applications.</p>
          </div>
        )}

        {!loading && (
          <div className="space-y-4">
            {filtered.map((app) => (
              <AppCard
                key={app.app_id}
                app={app}
                wallet={accountId}
                walletInstance={walletInstance}
                onUpdate={loadApps}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
