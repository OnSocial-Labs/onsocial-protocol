'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  Key,
  Plus,
  Trash2,
  RefreshCw,
  Activity,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { Button } from '@/components/ui/button';
import { PortalBadge } from '@/components/ui/portal-badge';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import {
  gatewayLogin,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
  getUsage,
  type ApiKeyInfo,
  type CreateKeyResult,
  type UsageSummary,
} from '@/features/onapi/api';
import { ACTIVE_API_URL } from '@/lib/portal-config';

// ── Helpers ───────────────────────────────────────────────────

function maskKey(prefix: string): string {
  return `${prefix}${'•'.repeat(20)}`;
}

function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Copy"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 portal-green-text" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function OnApiKeysPage() {
  const { accountId, wallet, isConnected, connect } = useWallet();

  // Gateway JWT session
  const [jwt, setJwt] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Key state
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [keysLoading, setKeysLoading] = useState(false);

  // Create key state
  const [newKey, setNewKey] = useState<CreateKeyResult | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');

  // Revoke state
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  // Rotate state
  const [rotating, setRotating] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState<string | null>(null);

  // Error
  const [error, setError] = useState<string | null>(null);

  const hasAuthed = useRef(false);

  // ── Authenticate with gateway ────────────────────────────────

  const authenticate = useCallback(async () => {
    if (!wallet || !accountId) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const token = await gatewayLogin(wallet, accountId);
      setJwt(token);
      hasAuthed.current = true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  }, [wallet, accountId]);

  // Auto-authenticate when wallet connects
  useEffect(() => {
    if (isConnected && wallet && accountId && !jwt && !hasAuthed.current) {
      authenticate();
    }
  }, [isConnected, wallet, accountId, jwt, authenticate]);

  // ── Fetch keys + usage when authenticated ────────────────────

  const refresh = useCallback(async () => {
    if (!jwt) return;
    setKeysLoading(true);
    setError(null);
    try {
      const [keyList, usageData] = await Promise.all([
        listApiKeys(jwt),
        getUsage(jwt).catch(() => null),
      ]);
      setKeys(keyList);
      setUsage(usageData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys');
    } finally {
      setKeysLoading(false);
    }
  }, [jwt]);

  useEffect(() => {
    if (jwt) refresh();
  }, [jwt, refresh]);

  // ── Create key ───────────────────────────────────────────────

  const handleCreate = async () => {
    if (!jwt) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createApiKey(jwt, label || 'default');
      setNewKey(result);
      setShowNewKey(true);
      setLabel('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  };

  // ── Revoke key ───────────────────────────────────────────────

  const handleRevoke = async (prefix: string) => {
    if (!jwt) return;
    setRevoking(prefix);
    setError(null);
    try {
      await revokeApiKey(jwt, prefix);
      setConfirmRevoke(null);
      if (newKey?.prefix === prefix) setNewKey(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key');
    } finally {
      setRevoking(null);
    }
  };

  // ── Rotate key ───────────────────────────────────────────────

  const handleRotate = async (prefix: string) => {
    if (!jwt) return;
    setRotating(prefix);
    setError(null);
    try {
      const result = await rotateApiKey(jwt, prefix);
      setNewKey(result);
      setShowNewKey(true);
      setConfirmRotate(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rotate key');
    } finally {
      setRotating(null);
    }
  };

  // ── Disconnected state ───────────────────────────────────────

  if (!isConnected) {
    return (
      <PageShell className="max-w-3xl">
        <SecondaryPageHeader
          badge="API Keys"
          badgeAccent="blue"
          title="Manage your OnAPI keys"
          description="Connect your NEAR wallet to create and manage API keys."
        />
        <SurfacePanel radius="xl" tone="soft" padding="roomy" className="text-center">
          <Key className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="mb-4 text-sm text-muted-foreground">
            Sign in with your NEAR wallet to get started.
          </p>
          <Button onClick={() => connect()} variant="default">
            Connect Wallet
          </Button>
        </SurfacePanel>
      </PageShell>
    );
  }

  // ── Authenticating state ─────────────────────────────────────

  if (!jwt) {
    return (
      <PageShell className="max-w-3xl">
        <SecondaryPageHeader
          badge="API Keys"
          badgeAccent="blue"
          title="Manage your OnAPI keys"
          description="Sign a message to verify wallet ownership."
        />
        <SurfacePanel radius="xl" tone="soft" padding="roomy" className="text-center">
          {authLoading ? (
            <>
              <PulsingDots size="md" />
              <p className="mt-3 text-sm text-muted-foreground">
                Sign the message in your wallet...
              </p>
            </>
          ) : authError ? (
            <>
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 portal-amber-text" />
              <p className="mb-2 text-sm text-foreground">{authError}</p>
              <Button onClick={authenticate} variant="outline" size="sm">
                Try Again
              </Button>
            </>
          ) : (
            <>
              <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="mb-4 text-sm text-muted-foreground">
                Verify wallet ownership to manage API keys.
              </p>
              <Button onClick={authenticate} variant="default">
                Sign &amp; Verify
              </Button>
            </>
          )}
        </SurfacePanel>
      </PageShell>
    );
  }

  // ── Authenticated: key management ────────────────────────────

  return (
    <PageShell className="max-w-3xl">
      <SecondaryPageHeader
        badge="API Keys"
        badgeAccent="blue"
        title="Manage your OnAPI keys"
        description={`Signed in as ${accountId}`}
      />

      {/* ── Usage Strip ─────────────────────────────────────── */}
      {usage && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <StatStrip columns={2}>
            <StatStripCell
              label="Requests today"
              value={usage.today.toLocaleString()}
              showDivider
            />
            <StatStripCell
              label="This month"
              value={usage.thisMonth.toLocaleString()}
            />
          </StatStrip>
        </motion.div>
      )}

      {/* ── Error banner ────────────────────────────────────── */}
      {error && (
        <div className="portal-amber-panel rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── New key reveal (show-once) ──────────────────────── */}
      {newKey && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <SurfacePanel
            radius="xl"
            tone="soft"
            padding="roomy"
            className="border-[var(--portal-green-border)] shadow-[0_0_20px_var(--portal-green-shadow)]"
          >
            <div className="mb-2 flex items-center gap-2">
              <Key className="h-4 w-4 portal-green-text" />
              <span className="text-sm font-semibold">New API Key Created</span>
              <PortalBadge accent="green" size="xs">
                {newKey.tier}
              </PortalBadge>
            </div>

            <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Copy this key now. It cannot be retrieved again.
            </p>

            <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
              <code className="flex-1 break-all font-mono text-xs">
                {showNewKey ? newKey.key : maskKey(newKey.prefix)}
              </code>
              <button
                onClick={() => setShowNewKey((v) => !v)}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showNewKey ? 'Hide key' : 'Reveal key'}
              >
                {showNewKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
              <CopyInline text={newKey.key} />
            </div>

            <p className="mt-2 text-[10px] text-muted-foreground">
              Label: {newKey.label} &middot; Prefix: {newKey.prefix}
            </p>
          </SurfacePanel>
        </motion.div>
      )}

      {/* ── Create key ──────────────────────────────────────── */}
      <SurfacePanel radius="xl" tone="soft" padding="roomy">
        <h3 className="mb-3 text-sm font-semibold">Create a new key</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Key label (optional)"
            maxLength={64}
            className="h-9 flex-1 rounded-lg border border-border/40 bg-background/40 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[var(--portal-blue)] focus:outline-none"
          />
          <Button
            onClick={handleCreate}
            loading={creating}
            disabled={creating || keys.length >= 10}
            size="sm"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Create Key
          </Button>
        </div>
        {keys.length >= 10 && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Maximum 10 keys reached. Revoke an existing key to create a new one.
          </p>
        )}
      </SurfacePanel>

      {/* ── Key list ────────────────────────────────────────── */}
      <SurfacePanel radius="xl" tone="soft" padding="none">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold">Your keys</h3>
          <button
            onClick={refresh}
            disabled={keysLoading}
            className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
          >
            {keysLoading ? <PulsingDots size="sm" /> : 'Refresh'}
          </button>
        </div>

        {keys.length === 0 ? (
          <div className="px-5 pb-5 text-center text-sm text-muted-foreground">
            {keysLoading ? (
              <PulsingDots size="md" />
            ) : (
              'No API keys yet. Create one above.'
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {keys.map((k) => (
              <div
                key={k.prefix}
                className="flex items-center gap-3 px-5 py-3"
              >
                <Key className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="truncate font-mono text-xs text-foreground">
                      {maskKey(k.prefix)}
                    </code>
                    <PortalBadge accent="blue" size="xs">
                      {k.tier}
                    </PortalBadge>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {k.label} &middot; Created{' '}
                    {new Date(k.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {confirmRevoke === k.prefix ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="destructive"
                      size="xs"
                      loading={revoking === k.prefix}
                      onClick={() => handleRevoke(k.prefix)}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setConfirmRevoke(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : confirmRotate === k.prefix ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="default"
                      size="xs"
                      loading={rotating === k.prefix}
                      onClick={() => handleRotate(k.prefix)}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setConfirmRotate(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setConfirmRevoke(null);
                        setConfirmRotate(k.prefix);
                      }}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={`Rotate key ${k.prefix}`}
                      title="Rotate key"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setConfirmRotate(null);
                        setConfirmRevoke(k.prefix);
                      }}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-red-400"
                      aria-label={`Revoke key ${k.prefix}`}
                      title="Revoke key"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SurfacePanel>

      {/* ── Quick start snippet ─────────────────────────────── */}
      <SurfacePanel radius="xl" tone="soft" padding="roomy">
        <div className="mb-2 flex items-center gap-2">
          <Activity className="h-4 w-4 portal-blue-text" />
          <h3 className="text-sm font-semibold">Quick start</h3>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border/30 bg-background/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <code>{`curl -X POST ${ACTIVE_API_URL.replace(/\/$/, '')}/graph/query \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_KEY" \\
  -d '{"query": "{ reputationScores(limit: 5) { accountId reputation rank } }"}'`}</code>
        </pre>
      </SurfacePanel>
    </PageShell>
  );
}
