'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Cloud,
  Code2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Sparkles,
  MessageSquare,
  RefreshCw,
  Rocket,
  Shield,
  Terminal,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { RiTelegram2Line } from 'react-icons/ri';
import { useWallet } from '@/contexts/wallet-context';
import { Button } from '@/components/ui/button';
import { OnChainConfigSummary } from '@/components/data/on-chain-config-summary';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { viewContract, yoctoToSocial, type OnChainAppConfig } from '@/lib/near-rpc';
import { portalColors, portalFrameStyle, type PortalAccent } from '@/lib/portal-colors';
import { rotateKey } from '@/features/partners/api';
import {
  botSnippet,
  envSnippet,
  installSnippet,
  packageJsonSnippet,
  sdkOnlySnippet,
} from '@/features/partners/snippets';
import type { AppRegistration } from '@/features/partners/types';
import { CodeBlock, CopyButton, DownloadButton } from '@/features/partners/ui-helpers';

export function PendingState({ appId, label }: { appId: string; label: string }) {
  return (
    <div className="rounded-[1.5rem] border border-border/50 bg-background/30 px-6 py-12 text-center">
      <div className="mb-4 flex justify-center">
        <span className="portal-blue-badge rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em]">
          In Queue
        </span>
      </div>
      <Clock className="portal-blue-icon mx-auto mb-4 h-16 w-16" />
      <h3 className="text-xl font-semibold mb-2 tracking-[-0.02em]">
        Application Received
      </h3>
      <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
        <span className="font-semibold text-foreground">{label}</span> (
        <span className="portal-blue-text font-mono">{appId}</span>) is
        currently in the approval queue.
      </p>
      <p className="text-sm text-muted-foreground">
        The next step will appear here once processing is complete.
      </p>
    </div>
  );
}

export function RejectedState({ appId, label }: { appId: string; label: string }) {
  return (
    <div className="rounded-[1.5rem] border border-border/50 bg-background/30 px-6 py-12 text-center">
      <div className="mb-4 flex justify-center">
        <span className="portal-red-badge rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em]">
          Review Complete
        </span>
      </div>
      <XCircle className="portal-red-icon w-16 h-16 mx-auto mb-4" />
      <h3 className="text-xl font-semibold mb-2 tracking-[-0.02em]">
        Application Not Approved
      </h3>
      <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
        Your application for{' '}
        <span className="font-semibold text-foreground">{label}</span> (
        <span className="portal-blue-text font-mono">{appId}</span>) was not
        approved at this time.
      </p>
      <p className="text-sm text-muted-foreground">
        For feedback before reapplying, contact OnSocial on{' '}
        <a
          href="https://t.me/onsocialprotocol"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex whitespace-nowrap align-middle items-center gap-1 font-medium portal-link"
        >
          <RiTelegram2Line className="h-3.5 w-3.5 shrink-0 translate-y-[0.5px]" />
          Telegram
        </a>
        .
      </p>
    </div>
  );
}

export function ApprovedDashboard({
  registration,
  onKeyRotated,
}: {
  registration: AppRegistration;
  onKeyRotated?: (_newKey: string) => void;
}) {
  const { accountId } = useWallet();
  const [tab, setTab] = useState<'bot' | 'sdk'>('bot');
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState('');
  const [onChainConfig, setOnChainConfig] = useState<OnChainAppConfig | null>(
    null
  );
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    setConfigLoading(true);
    viewContract<OnChainAppConfig>('get_app_config', {
      app_id: registration.appId,
    })
      .then((cfg) => setOnChainConfig(cfg))
      .catch(() => {})
      .finally(() => setConfigLoading(false));
  }, [registration.appId]);

  const handleRotate = async () => {
    if (!accountId) return;
    setRotating(true);
    setRotateError('');
    try {
      const result = await rotateKey(accountId, registration.apiKey);
      if (result.api_key) {
        onKeyRotated?.(result.api_key);
        setKeyRevealed(true);
      }
      setShowRotateConfirm(false);
    } catch (err) {
      setRotateError(err instanceof Error ? err.message : 'Rotation failed');
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border" style={portalFrameStyle('green')}>
            <Key className="portal-green-icon w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold tracking-[-0.02em]">Your OnApi Key</h3>
              <button
                onClick={() => setShowRotateConfirm(true)}
                className="portal-purple-surface inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
                title="Rotate API key"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rotate
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              App:{' '}
              <span className="font-mono text-foreground">{registration.appId}</span>
              {' · '}
              Label: <span className="text-foreground">{registration.label}</span>
            </p>
            <div className="relative">
              <code className="portal-green-text block break-all rounded-[1rem] border border-border/50 bg-background/50 px-4 py-3 pr-20 font-mono text-sm select-none">
                {keyRevealed
                  ? registration.apiKey
                  : `${registration.apiKey.slice(0, 10)}${'•'.repeat(32)}${registration.apiKey.slice(-4)}`}
              </code>
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                <button
                  onClick={() => setKeyRevealed((value) => !value)}
                  className="p-1.5 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
                  title={keyRevealed ? 'Hide key' : 'Reveal key'}
                >
                  {keyRevealed ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
                <CopyButton text={registration.apiKey} className="" />
              </div>
            </div>
            <p className="portal-amber-text text-xs mt-2">
              ⚠️ Store this securely — treat it like a password.
            </p>

            {showRotateConfirm && (
              <div className="portal-amber-panel mt-4 rounded-[1rem] border p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="portal-amber-icon w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium mb-1">Rotate API Key?</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      This will invalidate your current key immediately. Update
                      your bot&apos;s
                      <code className="portal-blue-text"> ONSOCIAL_API_KEY</code>{' '}
                      env var with the new key.
                    </p>
                    {rotateError && (
                      <p className="portal-red-text text-xs mb-3">{rotateError}</p>
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
                            <PulsingDots size="sm" className="mr-1.5" />
                            Rotating…
                          </>
                        ) : (
                          'Yes, rotate key'
                        )}
                      </Button>
                      <Button
                        onClick={() => {
                          setShowRotateConfirm(false);
                          setRotateError('');
                        }}
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

      <div className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Sparkles className="portal-purple-icon h-4 w-4" />
          <span>Your App Rules · On-Chain</span>
        </h3>
        {configLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <PulsingDots size="sm" /> Loading…
          </div>
        )}
        {!configLoading && !onChainConfig && (
          <p className="portal-amber-text text-xs">
            <AlertTriangle className="portal-amber-icon w-3 h-3 inline mr-1" />
            App not yet registered on-chain. Contact the OnSocial team.
          </p>
        )}
        {!configLoading && onChainConfig && (
          <OnChainConfigSummary config={onChainConfig} />
        )}
      </div>

      <div className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-6">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Integration Guide
        </h3>
        <div className="mb-4 flex max-w-xs gap-1 rounded-full border border-border/50 bg-muted/20 p-1">
          <button
            onClick={() => setTab('bot')}
            className={`flex-1 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
              tab === 'bot'
                ? 'portal-blue-surface'
                : 'portal-neutral-control'
            }`}
          >
            <Terminal className="w-4 h-4 inline mr-1.5" />
            Telegram Bot
          </button>
          <button
            onClick={() => setTab('sdk')}
            className={`flex-1 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
              tab === 'sdk'
                ? 'portal-blue-surface'
                : 'portal-neutral-control'
            }`}
          >
            <Code2 className="w-4 h-4 inline mr-1.5" />
            SDK Only
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-xs">
              1
            </span>
            Install
          </div>
          <CodeBlock code={installSnippet(tab)} language="bash" />
        </div>

        <div className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-xs">
                2
              </span>
              Create .env
            </div>
            <DownloadButton
              filename=".env"
              content={envSnippet(registration.appId, registration.apiKey, tab)}
              label="Download .env"
            />
          </div>
          <CodeBlock
            code={envSnippet(registration.appId, registration.apiKey, tab, {
              maskApiKey: true,
            })}
            language="bash"
          />
          {tab === 'bot' && (
            <p className="text-xs text-muted-foreground">
              Get your <code className="portal-blue-text">BOT_TOKEN</code> from{' '}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="portal-action-link"
              >
                @BotFather
              </a>{' '}
              on Telegram.
            </p>
          )}
        </div>

        <div className="space-y-4 mt-6">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-xs">
              3
            </span>
            {tab === 'bot' ? 'Create bot.ts' : 'Use the SDK'}
          </div>
          <CodeBlock code={tab === 'bot' ? botSnippet() : sdkOnlySnippet()} />
        </div>

        <div className="space-y-4 mt-6">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-xs">
              4
            </span>
            Run
          </div>
          {tab === 'bot' ? (
            <CodeBlock code="npm start" language="bash" />
          ) : (
            <CodeBlock
              code="node --env-file=.env --import tsx app.ts"
              language="bash"
            />
          )}
        </div>

        {tab === 'bot' && (
          <div className="mt-6 border-t border-border/30 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium mb-1">Download full project</h4>
                <p className="text-xs text-muted-foreground">
                  Get package.json + .env + bot.ts — ready to{' '}
                  <code className="portal-blue-text">
                    npm install &amp;&amp; npm start
                  </code>
                </p>
              </div>
              <div className="flex gap-2">
                <DownloadButton
                  filename="package.json"
                  content={packageJsonSnippet()}
                  label="package.json"
                />
                <DownloadButton filename="bot.ts" content={botSnippet()} label="bot.ts" />
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

      {tab === 'bot' && (
        <div className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-6">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Deploy
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Your bot needs a persistent process. Example:
          </p>
          <a
            href="https://fly.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-[1.25rem] border border-border/50 bg-background/30 p-4 transition-colors hover:border-border"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border" style={portalFrameStyle('purple')}>
              <Cloud className="portal-purple-icon w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm">Fly.io</h4>
              <p className="text-xs text-muted-foreground">
                Push to GitHub → always-on deploy. Free tier available.
              </p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </a>
        </div>
      )}

      {tab === 'bot' && (
        <div className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-6">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <MessageSquare className="portal-blue-icon mr-2 inline h-5 w-5" />
            Preview
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">
            This is how your bot will look in Telegram — fully branded, zero
            custom code needed.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.25rem] border border-border/50 bg-background/30 p-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                /start
              </p>
              <div className="rounded-[1rem] border border-white/5 bg-[#151827] p-3 text-sm font-mono leading-relaxed text-gray-200 shadow-inner shadow-black/10 space-y-1">
                <p>🤝 OnSocial stands with {registration.label}</p>
                <p className="mt-2">👋 Welcome!</p>
                <p className="mt-2 text-gray-400">
                  Earn 0.1 SOCIAL per message (up to 1/day) for being active in
                  the group.
                </p>
                <p className="mt-1 text-gray-400">
                  Tap below to link your NEAR account and start earning 👇
                </p>
                <div className="mt-3 flex gap-2">
                  <span className="portal-blue-badge rounded-full border px-2.5 py-1 text-xs">
                    🔗 Link Account
                  </span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-400">
                    ❓ How it works
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-[1.25rem] border border-border/50 bg-background/30 p-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                /balance
              </p>
              <div className="rounded-[1rem] border border-white/5 bg-[#151827] p-3 text-sm font-mono leading-relaxed text-gray-200 shadow-inner shadow-black/10 space-y-1">
                <p>🤝 OnSocial stands with {registration.label}</p>
                <p className="mt-2">
                  ⭐ Rewards for <span className="portal-green-text">alice.near</span>
                </p>
                <p className="mt-2">💎 Unclaimed: 12.5 SOCIAL</p>
                <p className="portal-green-text text-xs">(ready to claim!)</p>
                <p className="mt-1 text-gray-400">
                  📈 Daily progress: 0.5 / 1 SOCIAL
                </p>
                <p className="mt-1">🏆 Total earned: 42 SOCIAL</p>
                <div className="mt-3 flex gap-2">
                  <span className="portal-purple-badge rounded-full border px-2.5 py-1 text-xs">
                    💎 Claim
                  </span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-400">
                    🔄 Refresh
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            icon: Zap,
            title: 'Auto-rewarding',
            desc: 'Messages in groups earn SOCIAL tokens automatically',
            color: portalColors.green,
          },
          {
            icon: Shield,
            title: 'Seamless claims',
            desc: 'Users claim rewards in-bot without gas fees or wallet popups.',
            color: portalColors.blue,
          },
          {
            icon: Users,
            title: 'Account linking',
            desc: '/start → link NEAR account → start earning',
            color: portalColors.purple,
          },
          {
            icon: Rocket,
            title: 'Branded UX',
            desc: `"🤝 OnSocial stands with ${registration.label}"`,
            color: portalColors.green,
          },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-[1.25rem] border border-border/50 bg-background/30 p-4 transition-colors hover:border-border"
          >
            <item.icon className="w-5 h-5 mb-2" style={{ color: item.color }} />
            <h4 className="font-medium text-sm mb-1">{item.title}</h4>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>

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
  );
}