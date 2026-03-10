'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useWallet } from '@/contexts/wallet-context'
import {
  Rocket,
  Key,
  Copy,
  Check,
  Terminal,
  Code2,
  Zap,
  Shield,
  Users,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Layers,
  BarChart3,
  Loader2,
  Clock,
  XCircle,
  Download,
  MessageSquare,
  Cloud,
  RefreshCw,
  AlertTriangle,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 'apply' | 'submitting' | 'pending' | 'approved' | 'rejected'

interface AppRegistration {
  appId: string
  apiKey: string
  label: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://backend.onsocial.id'

const STEPS = [
  {
    icon: Users,
    title: 'Apply',
    description: 'Connect wallet and describe your dapp.',
  },
  {
    icon: Clock,
    title: 'Review',
    description: 'OnSocial team reviews your application.',
  },
  {
    icon: Key,
    title: 'Integrate',
    description: 'Get your OnApi key and integrate the SDK.',
  },
] as const

// ---------------------------------------------------------------------------
// Backend helpers
// ---------------------------------------------------------------------------

interface StatusResponse {
  success: boolean
  status: 'none' | 'pending' | 'approved' | 'rejected'
  app_id?: string
  label?: string
  api_key?: string
  applied_at?: string
  error?: string
}

interface RotateResponse {
  success: boolean
  app_id?: string
  api_key?: string
  error?: string
}

async function rotateKey(walletId: string, currentKey: string): Promise<RotateResponse> {
  const res = await fetch(`${BACKEND_URL}/v1/admin/rotate-key/${walletId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': currentKey,
    },
  })
  const data = (await res.json()) as RotateResponse
  if (!res.ok) throw new Error(data.error ?? 'Key rotation failed')
  return data
}

async function checkStatus(walletId: string): Promise<StatusResponse> {
  const res = await fetch(`${BACKEND_URL}/v1/admin/status/${walletId}`)
  if (!res.ok) throw new Error('Failed to check status')
  return (await res.json()) as StatusResponse
}

interface ApplyBody {
  app_id?: string
  label: string
  description: string
  expected_users: string
  contact: string
  wallet_id: string
}

interface ApplyResponse {
  success: boolean
  app_id: string
  label: string
  status: string
  error?: string
}

async function submitApplication(body: ApplyBody): Promise<ApplyResponse> {
  const res = await fetch(`${BACKEND_URL}/v1/admin/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as ApplyResponse
  if (!res.ok) throw new Error(data.error ?? 'Application failed')
  return data
}

// ---------------------------------------------------------------------------
// Code Snippets
// ---------------------------------------------------------------------------

function installSnippet(tab: 'bot' | 'sdk') {
  return tab === 'bot'
    ? `npm install @onsocial-id/rewards grammy`
    : `npm install @onsocial-id/rewards`
}

function envSnippet(appId: string, apiKey: string, tab: 'bot' | 'sdk') {
  const lines = [
    `ONSOCIAL_API_KEY=${apiKey}`,
    `ONSOCIAL_APP_ID=${appId}`,
  ]
  if (tab === 'bot') {
    lines.unshift(`BOT_TOKEN=your-telegram-bot-token`)
    lines.push(`# MIN_MESSAGE_LENGTH=10   # min chars to earn a reward`)
    lines.push(`# COOLDOWN_SEC=60         # seconds between rewarded messages`)
    lines.push(`# MIN_CLAIM_AMOUNT=1      # min SOCIAL earned to allow claim`)
    lines.push(`# NUDGE_THRESHOLD=5       # messages before nudging unlinked users (0=off)`)
  }
  return lines.join('\n')
}

function botSnippet() {
  return `import { createRewardsBot } from '@onsocial-id/rewards/bot';

const bot = createRewardsBot({
  botToken:         process.env.BOT_TOKEN!,
  apiKey:           process.env.ONSOCIAL_API_KEY!,
  appId:            process.env.ONSOCIAL_APP_ID!,
  minMessageLength: Number(process.env.MIN_MESSAGE_LENGTH) || 10,
  cooldownSec:      Number(process.env.COOLDOWN_SEC) || 60,
  minClaimAmount:   Number(process.env.MIN_CLAIM_AMOUNT) || 1,
  nudgeThreshold:   Number(process.env.NUDGE_THRESHOLD) || 5,
});

bot.start({ onStart: () => console.log('✅ Bot is running!') });`
}

function sdkOnlySnippet() {
  return `import { OnSocialRewards } from '@onsocial-id/rewards';

const rewards = new OnSocialRewards({
  apiKey: process.env.ONSOCIAL_API_KEY!,
  appId:  process.env.ONSOCIAL_APP_ID!,
});

// Credit a reward
await rewards.credit({ accountId: 'alice.near', source: 'message' });

// Gasless claim
const result = await rewards.claim('alice.near');`
}

function packageJsonSnippet() {
  return `{
  "name": "my-onsocial-bot",
  "type": "module",
  "scripts": { "start": "node --env-file=.env --import tsx bot.ts" },
  "dependencies": {
    "@onsocial-id/rewards": "latest",
    "grammy": "^1.0.0",
    "tsx": "^4.0.0"
  }
}`
}

/** Generate a zip-like text bundle the user can download as a complete project. */
function generateScaffold(appId: string, apiKey: string): string {
  const pkg = packageJsonSnippet()
  const env = `BOT_TOKEN=your-telegram-bot-token\nONSOCIAL_API_KEY=${apiKey}\nONSOCIAL_APP_ID=${appId}\n# MIN_MESSAGE_LENGTH=10\n# COOLDOWN_SEC=60\n# MIN_CLAIM_AMOUNT=1  # min SOCIAL earned to allow claim`
  const bot = botSnippet()
  return `// ── package.json ──\n${pkg}\n\n// ── .env ──\n${env}\n\n// ── bot.ts ──\n${bot}`
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function CopyButton({ text, className: extraClass }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground ${extraClass ?? 'absolute top-3 right-3'}`}
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-4 h-4 text-[#4ADE80]" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}

function DownloadButton({ filename, content, label }: { filename: string; content: string; label: string }) {
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleDownload}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border/50 bg-muted/40 hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function CodeBlock({ code, language = 'typescript' }: { code: string; language?: string }) {
  return (
    <div className="relative group">
      <pre className="bg-muted/40 rounded-xl p-4 overflow-x-auto text-sm font-mono text-muted-foreground border border-border/50">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  )
}

const STEP_COLORS = ['#4ADE80', '#3B82F6', '#A855F7'] as const

function StepIndicator({ steps, current }: { steps: typeof STEPS; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-12">
      {steps.map((step, i) => {
        const color = STEP_COLORS[i % 3]
        const active = i <= current
        return (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all ${
                active
                  ? 'border-border'
                  : 'border-border/50 text-muted-foreground'
              }`}
              style={active ? { color, borderColor: `${color}40` } : undefined}
            >
              {i < current ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <step.icon className="w-5 h-5" />
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-16 h-0.5 transition-colors ${i < current ? '' : 'bg-border/50'}`}
                style={i < current ? { backgroundColor: color } : undefined}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Application Form
// ---------------------------------------------------------------------------

function ApplicationForm({
  onSubmit,
}: {
  onSubmit: (data: {
    appId: string
    label: string
    description: string
    expectedUsers: string
    contact: string
  }) => Promise<void>
}) {
  const { accountId, connect } = useWallet()
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [expectedUsers, setExpectedUsers] = useState('')
  const [contact, setContact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const toSlug = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')

  const appId = toSlug(label)

  // Contract limits (must match rewards-onsocial/src/admin.rs)
  const MAX_LABEL_LEN = 128
  const MAX_APP_ID_LEN = 64

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!label.trim()) {
      setError('Dapp name is required')
      return
    }
    if (label.trim().length > MAX_LABEL_LEN) {
      setError(`Dapp name too long (max ${MAX_LABEL_LEN} characters)`)
      return
    }
    if (appId.length < 3) {
      setError('Dapp name is too short')
      return
    }
    if (appId.length > MAX_APP_ID_LEN) {
      setError(`App ID too long (max ${MAX_APP_ID_LEN} characters) — try a shorter name`)
      return
    }
    if (!accountId) {
      setError('Wallet not connected')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        appId,
        label: label.trim(),
        description: description.trim(),
        expectedUsers: expectedUsers.trim(),
        contact: contact.trim(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Application failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!accountId) {
    return (
      <div className="text-center py-12">
        <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
        <h3 className="text-xl font-semibold mb-2 tracking-[-0.02em]">Connect Your Wallet</h3>
        <p className="text-muted-foreground mb-6">
          Sign in with your NEAR wallet to apply as a partner.
        </p>
        <Button
          onClick={() => connect()}
          size="lg"
          className="font-semibold px-8"
        >
          Connect Wallet
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-5">
      <div className="text-center mb-6">
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="text-[#4ADE80] font-mono">{accountId}</span>
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Dapp Name *</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Acme Community"
          maxLength={MAX_LABEL_LEN}
          className="w-full px-4 py-3 rounded-full bg-muted/40 border border-border/50 focus:border-border focus:ring-1 focus:ring-border outline-none transition-colors text-sm"
          required
        />
        {appId && (
          <p className="text-xs text-muted-foreground mt-1">
            App ID: <span className="font-mono text-[#3B82F6]">{appId}</span>
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does your dapp do? How will you use SOCIAL rewards?"
          rows={3}
          className="w-full px-4 py-3 rounded-2xl bg-muted/40 border border-border/50 focus:border-border focus:ring-1 focus:ring-border outline-none transition-colors text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Expected Users</label>
        <input
          type="text"
          value={expectedUsers}
          onChange={(e) => setExpectedUsers(e.target.value)}
          placeholder="e.g. 500 Telegram group members"
          className="w-full px-4 py-3 rounded-full bg-muted/40 border border-border/50 focus:border-border focus:ring-1 focus:ring-border outline-none transition-colors text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Contact</label>
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="@telegram or email"
          className="w-full px-4 py-3 rounded-full bg-muted/40 border border-border/50 focus:border-border focus:ring-1 focus:ring-border outline-none transition-colors text-sm"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2">{error}</p>
      )}

      <Button
        type="submit"
        disabled={submitting || !appId || !label}
        size="lg"
        className="w-full font-semibold disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Submitting…
          </>
        ) : (
          <>
            Submit Application
            <ArrowRight className="w-4 h-4 ml-2" />
          </>
        )}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        Applications are reviewed by the OnSocial team. You&apos;ll receive your OnApi key upon approval.
      </p>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Pending State
// ---------------------------------------------------------------------------

function PendingState({ appId, label }: { appId: string; label: string }) {
  return (
    <div className="text-center py-12">
      <Clock className="w-16 h-16 mx-auto mb-4 text-[#3B82F6]" />
      <h3 className="text-xl font-semibold mb-2 tracking-[-0.02em]">Application Under Review</h3>
      <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
        Your application for <span className="font-semibold text-foreground">{label}</span>{' '}
        (<span className="font-mono text-[#3B82F6]">{appId}</span>) is being reviewed by the OnSocial team.
      </p>
      <p className="text-sm text-muted-foreground">
        Check back here after connecting your wallet to see your status.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rejected State
// ---------------------------------------------------------------------------

function RejectedState({ appId, label }: { appId: string; label: string }) {
  return (
    <div className="text-center py-12">
      <XCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
      <h3 className="text-xl font-semibold mb-2 tracking-[-0.02em]">Application Not Approved</h3>
      <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
        Your application for <span className="font-semibold text-foreground">{label}</span>{' '}
        (<span className="font-mono text-[#3B82F6]">{appId}</span>) was not approved at this time.
      </p>
      <p className="text-sm text-muted-foreground">
        Contact the OnSocial team if you have questions.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Approved Dashboard
// ---------------------------------------------------------------------------

function ApprovedDashboard({ registration, onKeyRotated }: { registration: AppRegistration; onKeyRotated?: (newKey: string) => void }) {
  const { accountId } = useWallet()
  const [tab, setTab] = useState<'bot' | 'sdk'>('bot')
  const [keyRevealed, setKeyRevealed] = useState(false)
  const [showRotateConfirm, setShowRotateConfirm] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [rotateError, setRotateError] = useState('')

  const handleRotate = async () => {
    if (!accountId) return
    setRotating(true)
    setRotateError('')
    try {
      const result = await rotateKey(accountId, registration.apiKey)
      if (result.api_key) {
        onKeyRotated?.(result.api_key)
        setKeyRevealed(true) // Show the new key so they can copy it
      }
      setShowRotateConfirm(false)
    } catch (err) {
      setRotateError(err instanceof Error ? err.message : 'Rotation failed')
    } finally {
      setRotating(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* API Key Card */}
      <div className="border border-[#4ADE80]/20 rounded-2xl p-6 bg-[#4ADE80]/[0.03]">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full border border-border/50 flex items-center justify-center flex-shrink-0">
            <Key className="w-5 h-5 text-[#4ADE80]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold tracking-[-0.02em]">Your OnApi Key</h3>
              <button
                onClick={() => setShowRotateConfirm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border/50 bg-muted/40 hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
                title="Rotate API key"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rotate
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              App: <span className="font-mono text-foreground">{registration.appId}</span>
              {' · '}
              Label: <span className="text-foreground">{registration.label}</span>
            </p>
            <div className="relative">
              <code className="block bg-muted/40 rounded-xl px-4 py-3 pr-20 font-mono text-sm text-[#4ADE80] break-all border border-border/50 select-none">
                {keyRevealed
                  ? registration.apiKey
                  : `${registration.apiKey.slice(0, 10)}${'•'.repeat(32)}${registration.apiKey.slice(-4)}`}
              </code>
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                <button
                  onClick={() => setKeyRevealed((v) => !v)}
                  className="p-1.5 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
                  title={keyRevealed ? 'Hide key' : 'Reveal key'}
                >
                  {keyRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <CopyButton text={registration.apiKey} className="" />
              </div>
            </div>
            <p className="text-xs text-yellow-500/80 mt-2">
              ⚠️ Store this securely — treat it like a password.
            </p>

            {/* Rotate confirmation */}
            {showRotateConfirm && (
              <div className="mt-4 border border-yellow-500/30 rounded-xl p-4 bg-yellow-500/[0.05]">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium mb-1">Rotate API Key?</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      This will invalidate your current key immediately. Update your bot&apos;s
                      <code className="text-[#3B82F6]"> ONSOCIAL_API_KEY</code> env var with the new key.
                    </p>
                    {rotateError && (
                      <p className="text-xs text-red-400 mb-3">{rotateError}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        onClick={handleRotate}
                        disabled={rotating}
                        size="sm"
                        className="font-medium text-xs"
                      >
                        {rotating ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                            Rotating…
                          </>
                        ) : (
                          'Yes, rotate key'
                        )}
                      </Button>
                      <Button
                        onClick={() => { setShowRotateConfirm(false); setRotateError('') }}
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        disabled={rotating}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Integration Tabs */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Integration Guide</h3>

        {/* Tab Bar */}
        <div className="flex gap-1 p-1 border border-border/50 rounded-full mb-4 max-w-xs bg-muted/30">
          <button
            onClick={() => setTab('bot')}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              tab === 'bot'
                ? 'bg-muted/80 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Terminal className="w-4 h-4 inline mr-1.5" />
            Telegram Bot
          </button>
          <button
            onClick={() => setTab('sdk')}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              tab === 'sdk'
                ? 'bg-muted/80 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Code2 className="w-4 h-4 inline mr-1.5" />
            SDK Only
          </button>
        </div>

        {/* Step 1: Install */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-xs">1</span>
            Install
          </div>
          <CodeBlock code={installSnippet(tab)} language="bash" />
        </div>

        {/* Step 2: Create .env */}
        <div className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-xs">2</span>
              Create .env
            </div>
            <DownloadButton
              filename=".env"
              content={envSnippet(registration.appId, registration.apiKey, tab)}
              label="Download .env"
            />
          </div>
          <CodeBlock code={envSnippet(registration.appId, registration.apiKey, tab)} language="bash" />
          {tab === 'bot' && (
            <p className="text-xs text-muted-foreground">
              Get your <code className="text-[#3B82F6]">BOT_TOKEN</code> from{' '}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#3B82F6] hover:underline"
              >
                @BotFather
              </a>{' '}
              on Telegram.
            </p>
          )}
        </div>

        {/* Step 3: Code */}
        <div className="space-y-4 mt-6">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-xs">3</span>
            {tab === 'bot' ? 'Create bot.ts' : 'Use the SDK'}
          </div>
          <CodeBlock
            code={tab === 'bot' ? botSnippet() : sdkOnlySnippet()}
          />
        </div>

        {/* Step 4: Run */}
        <div className="space-y-4 mt-6">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-xs">4</span>
            Run
          </div>
          {tab === 'bot' ? (
            <CodeBlock code="npm start" language="bash" />
          ) : (
            <CodeBlock code="node --env-file=.env --import tsx app.ts" language="bash" />
          )}
        </div>

        {/* Download full project */}
        {tab === 'bot' && (
          <div className="mt-6 pt-6 border-t border-border/30">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium mb-1">Download full project</h4>
                <p className="text-xs text-muted-foreground">
                  Get package.json + .env + bot.ts — ready to <code className="text-[#3B82F6]">npm install &amp;&amp; npm start</code>
                </p>
              </div>
              <div className="flex gap-2">
                <DownloadButton
                  filename="package.json"
                  content={packageJsonSnippet()}
                  label="package.json"
                />
                <DownloadButton
                  filename="bot.ts"
                  content={botSnippet()}
                  label="bot.ts"
                />
                <DownloadButton
                  filename=".env"
                  content={envSnippet(registration.appId, registration.apiKey, 'bot')}
                  label=".env"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Deploy Options */}
      {tab === 'bot' && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Deploy</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Your bot needs a persistent process. Example:
          </p>
          <a
            href="https://fly.io"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-border/50 rounded-2xl p-4 bg-muted/30 hover:border-border transition-colors flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full border border-[#A855F7]/30 flex items-center justify-center flex-shrink-0">
              <Cloud className="w-5 h-5 text-[#A855F7]" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm">Fly.io</h4>
              <p className="text-xs text-muted-foreground">Push to GitHub → always-on deploy. Free tier available.</p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </a>
        </div>
      )}

      {/* Bot Preview */}
      {tab === 'bot' && (
        <div>
          <h3 className="text-lg font-semibold mb-4">
            <MessageSquare className="w-5 h-5 inline mr-2 text-[#3B82F6]" />
            Preview
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            This is how your bot will look in Telegram — fully branded, zero custom code needed.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* /start preview */}
            <div className="border border-border/50 rounded-2xl p-4 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground mb-2">/start</p>
              <div className="bg-[#1a1a2e] rounded-xl p-3 text-sm text-gray-200 leading-relaxed font-mono space-y-1">
                <p>🤝 OnSocial stands with {registration.label}</p>
                <p className="mt-2">👋 Welcome!</p>
                <p className="mt-2 text-gray-400">Earn 0.1 SOCIAL per message (up to 1/day) for being active in the group.</p>
                <p className="mt-1 text-gray-400">Tap below to link your NEAR account and start earning 👇</p>
                <div className="mt-3 flex gap-2">
                  <span className="px-2.5 py-1 rounded-full border border-[#3B82F6]/40 text-[#3B82F6] text-xs">🔗 Link Account</span>
                  <span className="px-2.5 py-1 rounded-full border border-border/50 text-gray-400 text-xs">❓ How it works</span>
                </div>
              </div>
            </div>
            {/* /balance preview */}
            <div className="border border-border/50 rounded-2xl p-4 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground mb-2">/balance</p>
              <div className="bg-[#1a1a2e] rounded-xl p-3 text-sm text-gray-200 leading-relaxed font-mono space-y-1">
                <p>🤝 OnSocial stands with {registration.label}</p>
                <p className="mt-2">⭐ Rewards for <span className="text-[#4ADE80]">alice.near</span></p>
                <p className="mt-2">💎 Unclaimed: 12.5 SOCIAL</p>
                <p className="text-[#4ADE80] text-xs">(ready to claim!)</p>
                <p className="mt-1 text-gray-400">📈 Daily progress: 0.5 / 1 SOCIAL</p>
                <p className="mt-1">🏆 Total earned: 42 SOCIAL</p>
                <div className="mt-3 flex gap-2">
                  <span className="px-2.5 py-1 rounded-full border border-[#A855F7]/40 text-[#A855F7] text-xs">💎 Claim</span>
                  <span className="px-2.5 py-1 rounded-full border border-border/50 text-gray-400 text-xs">🔄 Refresh</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* What You Get */}
      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { icon: Zap, title: 'Auto-rewarding', desc: 'Messages in groups earn SOCIAL tokens automatically', color: '#4ADE80' },
          { icon: Shield, title: 'Gasless claims', desc: 'Users claim tokens in-bot with zero gas fees', color: '#3B82F6' },
          { icon: Users, title: 'Account linking', desc: '/start → link NEAR account → start earning', color: '#A855F7' },
          { icon: Rocket, title: 'Branded UX', desc: `"🤝 OnSocial stands with ${registration.label}" everywhere`, color: '#4ADE80' },
        ].map((item) => (
          <div
            key={item.title}
            className="border border-border/50 rounded-2xl p-4 bg-muted/30 hover:border-border transition-colors"
          >
            <item.icon className="w-5 h-5 mb-2" style={{ color: item.color }} />
            <h4 className="font-medium text-sm mb-1">{item.title}</h4>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Docs link */}
      <div className="text-center pt-4">
        <a
          href="https://github.com/OnSocial-Labs/onsocial-protocol"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
        >
          Full SDK documentation
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PartnersPage() {
  const { accountId } = useWallet()
  const [step, setStep] = useState<Step>('apply')
  const [registration, setRegistration] = useState<AppRegistration | null>(null)
  const [pendingApp, setPendingApp] = useState<{ appId: string; label: string } | null>(null)
  const [pageError, setPageError] = useState('')
  const [loading, setLoading] = useState(false)

  // Auto-check existing application status on wallet connect
  useEffect(() => {
    if (!accountId) return

    let cancelled = false
    setLoading(true)

    checkStatus(accountId)
      .then((data) => {
        if (cancelled) return

        if (data.status === 'approved' && data.api_key) {
          setRegistration({
            appId: data.app_id!,
            apiKey: data.api_key,
            label: data.label!,
          })
          setStep('approved')
        } else if (data.status === 'pending') {
          setPendingApp({ appId: data.app_id!, label: data.label! })
          setStep('pending')
        } else if (data.status === 'rejected') {
          setPendingApp({ appId: data.app_id!, label: data.label! })
          setStep('rejected')
        }
        // status === 'none' → stay on 'apply'
      })
      .catch(() => {
        // Backend unreachable — let user apply anyway
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accountId])

  const handleApply = useCallback(
    async (data: {
      appId: string
      label: string
      description: string
      expectedUsers: string
      contact: string
    }) => {
      if (!accountId) throw new Error('Wallet not connected')

      setPageError('')
      setStep('submitting')

      try {
        const result = await submitApplication({
          app_id: data.appId,
          label: data.label,
          description: data.description,
          expected_users: data.expectedUsers,
          contact: data.contact,
          wallet_id: accountId,
        })

        setPendingApp({ appId: result.app_id, label: result.label })
        setStep('pending')
      } catch (err) {
        setPageError(err instanceof Error ? err.message : 'Application failed')
        setStep('apply')
      }
    },
    [accountId],
  )

  const currentStep =
    step === 'apply' || step === 'submitting'
      ? 0
      : step === 'pending'
        ? 1
        : step === 'approved'
          ? 2
          : 0

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 max-w-3xl">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-[-0.03em]">
            Partner Integration
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            Add SOCIAL token rewards to your community in 5 lines of code.
          </p>
        </motion.div>

        {/* Steps */}
        <StepIndicator steps={STEPS} current={currentStep} />

        {/* Content Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="border border-border/50 rounded-2xl p-8 bg-muted/30"
        >
          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-[#3B82F6]" />
              <p className="text-sm text-muted-foreground">Checking application status…</p>
            </div>
          )}
          {!loading && step === 'apply' && <ApplicationForm onSubmit={handleApply} />}
          {!loading && step === 'apply' && pageError && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2 mt-4 text-center">
              {pageError}
            </p>
          )}
          {step === 'submitting' && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-[#3B82F6]" />
              <h3 className="text-lg font-semibold mb-2">Submitting application…</h3>
            </div>
          )}
          {step === 'pending' && pendingApp && (
            <PendingState appId={pendingApp.appId} label={pendingApp.label} />
          )}
          {step === 'rejected' && pendingApp && (
            <RejectedState appId={pendingApp.appId} label={pendingApp.label} />
          )}
          {step === 'approved' && registration && (
            <ApprovedDashboard
              registration={registration}
              onKeyRotated={(newKey) =>
                setRegistration((prev) => prev ? { ...prev, apiKey: newKey } : prev)
              }
            />
          )}
        </motion.div>

        {/* Features below */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <h2 className="text-2xl font-bold mb-8 tracking-[-0.03em]">Why Partner With OnSocial?</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                title: 'Zero Gas For Users',
                desc: 'We pay the gas. Users earn and claim tokens without ever touching crypto UX.',
                color: '#4ADE80',
              },
              {
                icon: Shield,
                title: 'On-Chain Safety',
                desc: 'Contract enforces daily caps and budgets. No partner can inflate rewards.',
                color: '#3B82F6',
              },
              {
                icon: Rocket,
                title: '5 Lines of Code',
                desc: 'npm install, configure 3 env vars, deploy. Your bot handles rewards automatically.',
                color: '#A855F7',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="border border-border/50 rounded-2xl p-6 bg-muted/30 hover:border-border transition-colors"
              >
                <item.icon className="w-8 h-8 mx-auto mb-3" style={{ color: item.color }} />
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ─── Dapp Rewards ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-24"
        >
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.03em] mb-4">
              Dapp Rewards
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Dapps reward their users with $SOCIAL tokens for engagement. Fully on-chain, gasless, and
              configurable per app.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto">
            {[
              {
                icon: Zap,
                title: 'Gasless Distribution',
                desc: 'Rewards are distributed gaslessly — users never pay transaction fees to claim.',
                color: '#4ADE80',
              },
              {
                icon: Layers,
                title: 'Multi-App Support',
                desc: 'Each dapp configures its own reward pool, daily caps, and per-action amounts.',
                color: '#3B82F6',
              },
              {
                icon: Shield,
                title: 'Per-User Limits',
                desc: 'Global daily caps per user prevent abuse across all participating dapps.',
                color: '#A855F7',
              },
              {
                icon: BarChart3,
                title: 'Pool-Based Claims',
                desc: 'Dapps fund reward pools with $SOCIAL. Users earn and claim from the pool.',
                color: '#F59E0B',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="border border-border/50 rounded-2xl p-6 bg-muted/30 hover:border-border transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-xl border flex items-center justify-center mb-4"
                  style={{ borderColor: `${f.color}30` }}
                >
                  <f.icon className="w-5 h-5" style={{ color: f.color }} />
                </div>
                <h3 className="text-base font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Flow diagram */}
          <div className="max-w-3xl mx-auto mt-8">
            <div className="border border-border/50 rounded-2xl p-6 bg-muted/30">
              <h3 className="text-base font-semibold mb-4 text-center">Reward Flow</h3>
              <div className="flex items-center justify-center gap-2 flex-wrap text-sm">
                <span className="px-3 py-1.5 border border-[#A855F7]/30 rounded-full text-[#A855F7] font-medium text-xs md:text-sm">
                  Dapp funds pool
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 hidden sm:block" />
                <span className="px-3 py-1.5 border border-[#3B82F6]/30 rounded-full text-[#3B82F6] font-medium text-xs md:text-sm">
                  User earns reward
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 hidden sm:block" />
                <span className="px-3 py-1.5 border border-[#4ADE80]/30 rounded-full text-[#4ADE80] font-medium text-xs md:text-sm">
                  Gasless claim
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
