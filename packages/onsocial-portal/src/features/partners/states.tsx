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
  MessageSquare,
  RefreshCw,
  Rocket,
  Shield,
  Terminal,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { Button } from '@/components/ui/button';
import { OnChainConfigSummary } from '@/components/data/on-chain-config-summary';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { viewContract, yoctoToSocial, type OnChainAppConfig } from '@/lib/near-rpc';
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
    <div className="text-center py-12">
      <Clock className="w-16 h-16 mx-auto mb-4 text-[#60A5FA]" />
      <h3 className="text-xl font-semibold mb-2 tracking-[-0.02em]">
        Application Under Review
      </h3>
      <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
        Your application for{' '}
        <span className="font-semibold text-foreground">{label}</span> (
        <span className="font-mono text-[#60A5FA]">{appId}</span>) is under
        review.
      </p>
      <p className="text-sm text-muted-foreground">
        Check back here after connecting your wallet to see your status.
      </p>
    </div>
  );
}

export function RejectedState({ appId, label }: { appId: string; label: string }) {
  return (
    <div className="text-center py-12">
      <XCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
      <h3 className="text-xl font-semibold mb-2 tracking-[-0.02em]">
        Application Not Approved
      </h3>
      <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
        Your application for{' '}
        <span className="font-semibold text-foreground">{label}</span> (
        <span className="font-mono text-[#60A5FA]">{appId}</span>) was not
        approved at this time.
      </p>
      <p className="text-sm text-muted-foreground">
        Contact the OnSocial team if you have questions.
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
              App:{' '}
              <span className="font-mono text-foreground">{registration.appId}</span>
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
            <p className="text-xs text-yellow-500/80 mt-2">
              ⚠️ Store this securely — treat it like a password.
            </p>

            {showRotateConfirm && (
              <div className="mt-4 border border-yellow-500/30 rounded-xl p-4 bg-yellow-500/[0.05]">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium mb-1">Rotate API Key?</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      This will invalidate your current key immediately. Update
                      your bot&apos;s
                      <code className="text-[#60A5FA]"> ONSOCIAL_API_KEY</code>{' '}
                      env var with the new key.
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

      <div className="border border-[#C084FC]/15 rounded-2xl p-6 bg-[#C084FC]/[0.02]">
        <h3 className="text-sm font-semibold text-[#C084FC] mb-4 uppercase tracking-wider">
          Your App Rules · On-Chain
        </h3>
        {configLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <PulsingDots size="sm" /> Loading…
          </div>
        )}
        {!configLoading && !onChainConfig && (
          <p className="text-xs text-yellow-500/80">
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            App not yet registered on-chain. Contact the OnSocial team.
          </p>
        )}
        {!configLoading && onChainConfig && (
          <OnChainConfigSummary config={onChainConfig} />
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Integration Guide</h3>
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
            code={envSnippet(registration.appId, registration.apiKey, tab)}
            language="bash"
          />
          {tab === 'bot' && (
            <p className="text-xs text-muted-foreground">
              Get your <code className="text-[#60A5FA]">BOT_TOKEN</code> from{' '}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#60A5FA] hover:underline"
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
          <div className="mt-6 pt-6 border-t border-border/30">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium mb-1">Download full project</h4>
                <p className="text-xs text-muted-foreground">
                  Get package.json + .env + bot.ts — ready to{' '}
                  <code className="text-[#60A5FA]">
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
            <div className="w-10 h-10 rounded-full border border-[#C084FC]/30 flex items-center justify-center flex-shrink-0">
              <Cloud className="w-5 h-5 text-[#C084FC]" />
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
        <div>
          <h3 className="text-lg font-semibold mb-4">
            <MessageSquare className="w-5 h-5 inline mr-2 text-[#60A5FA]" />
            Preview
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            This is how your bot will look in Telegram — fully branded, zero
            custom code needed.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border border-border/50 rounded-2xl p-4 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground mb-2">/start</p>
              <div className="bg-[#1a1a2e] rounded-xl p-3 text-sm text-gray-200 leading-relaxed font-mono space-y-1">
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
                  <span className="px-2.5 py-1 rounded-full border border-[#60A5FA]/40 text-[#60A5FA] text-xs">
                    🔗 Link Account
                  </span>
                  <span className="px-2.5 py-1 rounded-full border border-border/50 text-gray-400 text-xs">
                    ❓ How it works
                  </span>
                </div>
              </div>
            </div>
            <div className="border border-border/50 rounded-2xl p-4 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground mb-2">/balance</p>
              <div className="bg-[#1a1a2e] rounded-xl p-3 text-sm text-gray-200 leading-relaxed font-mono space-y-1">
                <p>🤝 OnSocial stands with {registration.label}</p>
                <p className="mt-2">
                  ⭐ Rewards for <span className="text-[#4ADE80]">alice.near</span>
                </p>
                <p className="mt-2">💎 Unclaimed: 12.5 SOCIAL</p>
                <p className="text-[#4ADE80] text-xs">(ready to claim!)</p>
                <p className="mt-1 text-gray-400">
                  📈 Daily progress: 0.5 / 1 SOCIAL
                </p>
                <p className="mt-1">🏆 Total earned: 42 SOCIAL</p>
                <div className="mt-3 flex gap-2">
                  <span className="px-2.5 py-1 rounded-full border border-[#C084FC]/40 text-[#C084FC] text-xs">
                    💎 Claim
                  </span>
                  <span className="px-2.5 py-1 rounded-full border border-border/50 text-gray-400 text-xs">
                    🔄 Refresh
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {[
          {
            icon: Zap,
            title: 'Auto-rewarding',
            desc: 'Messages in groups earn SOCIAL tokens automatically',
            color: '#4ADE80',
          },
          {
            icon: Shield,
            title: 'Gasless claims',
            desc: 'Users claim tokens in-bot with zero gas fees',
            color: '#60A5FA',
          },
          {
            icon: Users,
            title: 'Account linking',
            desc: '/start → link NEAR account → start earning',
            color: '#C084FC',
          },
          {
            icon: Rocket,
            title: 'Branded UX',
            desc: `"🤝 OnSocial stands with ${registration.label}"`,
            color: '#4ADE80',
          },
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