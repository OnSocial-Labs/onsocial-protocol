'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  Boxes,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { useGatewayAuth } from '@/contexts/gateway-auth-context';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { Button } from '@/components/ui/button';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  TransactionFeedbackToast,
  type TransactionFeedback,
} from '@/components/ui/transaction-feedback-toast';
import { fadeUpMotion, scaleFadeMotion } from '@/lib/motion';
import {
  listDeveloperApps,
  registerDeveloperApp,
  deleteDeveloperApp,
  type DeveloperAppInfo,
} from '@/features/onapi/api';

const APP_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('cancelled') || lower.includes('canceled'))
    return 'Action cancelled';
  if (lower.includes('authentication') || lower.includes('unauthorized'))
    return 'Session expired — sign in again';
  if (lower.includes('network') || lower.includes('fetch'))
    return 'Network error — check your connection';
  return raw;
}

export default function OnApiAppsPage() {
  const {
    isConnected,
    isLoading: walletLoading,
    connect,
  } = useWallet();
  const {
    jwt,
    isAuthenticating: authLoading,
    ensureAuth,
    clearAuth,
  } = useGatewayAuth();
  const { setNavBack } = useMobilePageContext();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setNavBack({ label: 'Back' });
    return () => setNavBack(null);
  }, [setNavBack]);

  const [apps, setApps] = useState<DeveloperAppInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [appIdInput, setAppIdInput] = useState('');
  const [creating, setCreating] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<TransactionFeedback | null>(null);

  useEffect(() => {
    if (error) {
      setToast({ type: 'error', msg: friendlyError(error) });
    }
  }, [error]);

  const refresh = useCallback(async () => {
    if (!jwt) return;
    setLoading(true);
    setError(null);
    try {
      const appList = await listDeveloperApps(jwt);
      setApps(appList);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load apps';
      if (msg.includes('Authentication')) {
        try {
          const token = await ensureAuth();
          if (token) {
            const appList = await listDeveloperApps(token);
            setApps(appList);
            return;
          }
        } catch {
          /* fall through */
        }
        clearAuth();
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [jwt, ensureAuth, clearAuth]);

  useEffect(() => {
    if (!jwt) {
      setApps([]);
      setError(null);
      return;
    }
    void refresh();
  }, [jwt, refresh]);

  const handleCreate = async () => {
    if (!jwt) return;
    const slug = appIdInput.trim().toLowerCase();
    if (!APP_ID_RE.test(slug)) {
      setError(
        'App ID must be 2-64 characters: lowercase letters, numbers, hyphens, or underscores.'
      );
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await registerDeveloperApp(jwt, slug);
      setAppIdInput('');
      setShowCreateForm(false);
      setToast({ type: 'success', msg: `App "${slug}" created.` });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create app');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (appId: string) => {
    if (!jwt) return;
    setDeleting(appId);
    setError(null);
    try {
      await deleteDeveloperApp(jwt, appId);
      setConfirmDelete(null);
      setToast({ type: 'success', msg: `App "${appId}" deleted.` });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete app');
    } finally {
      setDeleting(null);
    }
  };

  const appIdValid = APP_ID_RE.test(appIdInput.trim().toLowerCase());

  // ── Unauthenticated state ──
  if (!jwt) {
    return (
      <PageShell className="max-w-3xl space-y-6">
        <SecondaryPageHeader badge="App Namespaces" badgeAccent="blue" />
        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="roomy"
          className="text-center"
        >
          {!isConnected ? (
            <>
              <Boxes className="mx-auto mb-3 h-6 w-6 text-muted-foreground/40" />
              <p className="mb-4 text-sm font-medium text-foreground">
                Connect to manage your app namespaces
              </p>
              <Button
                onClick={connect}
                variant="default"
                size="sm"
                loading={walletLoading}
              >
                Sign in
              </Button>
            </>
          ) : (
            <>
              <Boxes className="mx-auto mb-3 h-6 w-6 text-muted-foreground/40" />
              <p className="mb-1 text-sm font-medium text-foreground">
                One more step
              </p>
              <p className="mb-4 text-[11px] text-muted-foreground">
                Sign a message to open your session — no gas, no transaction.
              </p>
              <Button
                onClick={ensureAuth}
                variant="default"
                size="sm"
                loading={authLoading}
              >
                Authorize
              </Button>
            </>
          )}
        </SurfacePanel>
        <TransactionFeedbackToast
          result={toast}
          onClose={() => setToast(null)}
        />
      </PageShell>
    );
  }

  // ── Authenticated state ──
  return (
    <PageShell className="max-w-3xl space-y-6">
      <SecondaryPageHeader
        badge="App Namespaces"
        badgeAccent="blue"
        description="Scope notifications, events, and webhooks per app. A &ldquo;default&rdquo; namespace is created automatically."
      />

      {/* ── Create form ── */}
      <AnimatePresence mode="wait">
        {showCreateForm ? (
          <motion.div key="create-form" {...scaleFadeMotion(!!reduceMotion)}>
            <SurfacePanel radius="xl" tone="soft" padding="roomy">
              <h3 className="mb-3 text-sm font-semibold">New app namespace</h3>
              <div className="flex gap-2 items-center">
                <SurfacePanel
                  radius="md"
                  tone="inset"
                  borderTone="subtle"
                  padding="none"
                  className="flex flex-1 items-center px-3 py-1.5 transition-[border-color] duration-150 ease focus-within:border-[color-mix(in_srgb,var(--portal-blue)_50%,transparent)]"
                >
                  <input
                    type="text"
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        appIdValid &&
                        !creating
                      ) {
                        e.preventDefault();
                        handleCreate();
                      }
                    }}
                    placeholder="my-app-name"
                    maxLength={64}
                    required
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm font-medium tracking-[-0.01em] outline-none placeholder:text-muted-foreground/50"
                  />
                </SurfacePanel>
                <Button
                  onClick={handleCreate}
                  loading={creating}
                  disabled={creating || !appIdValid}
                  size="xs"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Create
                </Button>
                <Button
                  onClick={() => {
                    setShowCreateForm(false);
                    setAppIdInput('');
                  }}
                  variant="ghost"
                  size="xs"
                  disabled={creating}
                >
                  Cancel
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Lowercase letters, numbers, hyphens, underscores. 2-64
                characters.
              </p>
            </SurfacePanel>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── Apps list ── */}
      <motion.div
        {...fadeUpMotion(!!reduceMotion, { distance: 12, delay: 0.12 })}
      >
        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="none"
          className="overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-2 md:px-5">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {apps.length > 0 ? 'Your apps' : 'Get started'}
            </h3>
            <div className="flex items-center gap-2">
              {!showCreateForm && (
                <Button
                  onClick={() => setShowCreateForm(true)}
                  variant="outline"
                  size="xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New app
                </Button>
              )}
              {apps.length > 0 && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={refresh}
                  disabled={loading}
                  aria-label="Refresh apps"
                  className="h-7 w-7 md:h-7 md:w-7 border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                  />
                </Button>
              )}
            </div>
          </div>

          {apps.length === 0 && !loading ? (
            <div className="px-4 pb-5 pt-2 text-center md:px-5">
              <Boxes className="mx-auto mb-2 h-5 w-5 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                No app namespaces yet. Create one to scope your notifications
                and webhooks.
              </p>
            </div>
          ) : loading && apps.length === 0 ? (
            <div className="py-6 text-center">
              <PulsingDots size="md" />
            </div>
          ) : (
            <div>
              {apps.map((app, i) => (
                <div key={app.appId}>
                  {i > 0 && (
                    <div className="h-px divider-detail mx-4 md:mx-5" />
                  )}
                  <div className="flex items-center gap-3 px-4 py-3 md:px-5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/40 bg-muted/20">
                      <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <code className="block truncate font-mono text-sm font-medium text-foreground">
                        {app.appId}
                      </code>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Created{' '}
                        {new Date(app.createdAt).toLocaleDateString(
                          undefined,
                          {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          }
                        )}
                      </p>
                    </div>

                    {/* delete — protected for "default" */}
                    {app.appId === 'default' ? (
                      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/50">
                        Default
                      </span>
                    ) : confirmDelete === app.appId ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="destructive"
                          size="xs"
                          loading={deleting === app.appId}
                          onClick={() => handleDelete(app.appId)}
                        >
                          Delete
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setConfirmDelete(null)}
                          disabled={deleting === app.appId}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(app.appId)}
                        className="text-muted-foreground/40 transition-colors hover:text-destructive"
                        aria-label={`Delete ${app.appId}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfacePanel>
      </motion.div>

      {/* ── Explainer ── */}
      <motion.div
        {...fadeUpMotion(!!reduceMotion, { distance: 12, delay: 0.2 })}
      >
        <SurfacePanel radius="xl" tone="soft" padding="roomy">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p>
                <strong className="text-foreground/70">What are app namespaces?</strong>{' '}
                They isolate notification events, rules, and webhooks. Use
                separate namespaces for different products (e.g.{' '}
                <code className="portal-blue-text">my-tg-bot</code>,{' '}
                <code className="portal-blue-text">my-web-app</code>).
              </p>
              <p>
                The <code className="portal-blue-text">default</code> namespace
                is created automatically and used when no appId is specified in
                API calls.
              </p>
            </div>
          </div>
        </SurfacePanel>
      </motion.div>

      <TransactionFeedbackToast
        result={toast}
        onClose={() => setToast(null)}
      />
    </PageShell>
  );
}
