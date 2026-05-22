'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { BeforeMount } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { playgroundExamples, categories } from '@/data/playground-examples';
import type { ExampleSnippet } from '@/data/playground-examples';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { Button, ButtonLoadingContent } from '@/components/ui/button';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import {
  Play,
  Copy,
  RotateCcw,
  Book,
  Github,
  Code2,
  Terminal,
  CheckCircle2,
  ExternalLink,
  Wallet,
  Check,
} from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { useGatewayAuth } from '@/contexts/gateway-auth-context';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import {
  executeOnPortalNetwork,
  isReadOnlyPlaygroundExample,
  requiresGatewayAuthForPlaygroundExample,
} from '@/lib/testnet-executor';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  ACTIVE_NEAR_NETWORK,
} from '@/lib/portal-config';

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-muted/10 text-muted-foreground">
      <div className="w-full space-y-3 px-6">
        <div className="h-4 w-28 rounded-full bg-white/8 animate-pulse" />
        <div className="h-3 w-full rounded-full bg-white/6 animate-pulse" />
        <div className="h-3 w-11/12 rounded-full bg-white/6 animate-pulse" />
        <div className="h-3 w-4/5 rounded-full bg-white/6 animate-pulse" />
        <div className="mt-5 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          Loading editor
        </div>
      </div>
    </div>
  ),
});

const PLAYGROUND_EDITOR_TYPES = `
declare module "@onsocial/sdk" {
  export const PERMISSION: {
    readonly NONE: 0;
    readonly WRITE: 1;
    readonly MODERATE: 2;
    readonly MANAGE: 3;
  };

  export function NEAR(value: string | number | bigint): string;
}

declare const wallet: {
  accountId: string;
};

declare const portalNetwork: 'testnet' | 'mainnet';

declare const os: any;
`;

const configurePlaygroundEditor: BeforeMount = (monaco) => {
  const ts = monaco.languages.typescript;

  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    moduleDetection: 3,
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    noEmit: true,
  });
  ts.typescriptDefaults.setDiagnosticsOptions({
    diagnosticCodesToIgnore: [1375, 1378],
  });

  ts.typescriptDefaults.addExtraLib(
    PLAYGROUND_EDITOR_TYPES,
    'ts:filename/onsocial-playground.d.ts'
  );
};

function PlaygroundContent() {
  const { accountId, isConnected, wallet } = useWallet();
  const { ensureAuth, isAuthenticating, jwt, authError } = useGatewayAuth();
  const { theme } = useTheme();
  const { txResult, setTxResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);

  const [selectedExample, setSelectedExample] = useState<ExampleSnippet>(
    playgroundExamples[0]
  );
  const [code, setCode] = useState(selectedExample.code);
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [useLiveNetwork, setUseLiveNetwork] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reset, setReset] = useState(false);
  const liveReady = useLiveNetwork && isConnected;
  const selectedNeedsOnApiSession = requiresGatewayAuthForPlaygroundExample(
    selectedExample.id
  );
  const hasOnApiSession = Boolean(jwt);
  const liveSessionPending =
    liveReady && selectedNeedsOnApiSession && !hasOnApiSession;
  const runButtonLabel = liveSessionPending ? 'Authorize OnAPI' : 'Run Code';
  const fallbackPlaygroundAccount =
    ACTIVE_NEAR_NETWORK === 'mainnet' ? 'onsocial.near' : 'onsocial.testnet';

  const handleExampleSelect = (example: ExampleSnippet) => {
    setSelectedExample(example);
    setCode(example.code);
    setOutput('');
  };

  const authorizeOnApiSession = async () => {
    setOutput('⏳ Authorizing OnAPI session...\n\n');
    setTxHash(null);
    clearTxResult();

    const token = await ensureAuth();
    if (token) {
      setOutput(
        `✅ OnAPI session ready for ${ACTIVE_NEAR_NETWORK}.\n\nClick "Run Code" when you want to submit the wallet transaction. No permanent API key was created.`
      );
      return;
    }

    const message = authError ?? 'The OnAPI session was not authorized.';
    setOutput(`❌ OnAPI session not ready.\n\n${message}`);
  };

  const handleRun = async () => {
    if (liveSessionPending) {
      setIsRunning(true);
      try {
        await authorizeOnApiSession();
      } finally {
        setIsRunning(false);
      }
      return;
    }

    setIsRunning(true);
    setOutput('⏳ Running code...\n\n');
    setTxHash(null);
    clearTxResult();

    const liveReadOnly = isReadOnlyPlaygroundExample(selectedExample.id);
    const needsGatewayAuth = selectedNeedsOnApiSession;
    const canRunLive =
      useLiveNetwork && (isConnected || (liveReadOnly && !needsGatewayAuth));

    if (canRunLive) {
      try {
        const authToken =
          needsGatewayAuth && isConnected ? await ensureAuth() : null;

        if (needsGatewayAuth && !authToken) {
          setOutput(
            '❌ OnAPI session required.\n\nApprove the OnAPI wallet message so this SDK example can use compose, indexed query, and storage endpoints. No permanent API key is created.'
          );
          return;
        }

        const result = await executeOnPortalNetwork(
          code,
          accountId ?? fallbackPlaygroundAccount,
          wallet,
          selectedExample.id,
          authToken
        );

        if (!result.success) {
          setOutput(result.output);
          if (result.error) {
            setTxResult({
              type: 'error',
              msg: result.error,
            });
          }
          return;
        }

        const txHashes = result.txHashes?.length
          ? result.txHashes
          : result.txHash
            ? [result.txHash]
            : [];

        if (txHashes.length > 0 && result.actionLabel) {
          setTxHash(txHashes[0]);
          setOutput('⏳ Submitting transaction…\n\n');

          const confirmed = await trackTransaction({
            txHashes,
            submittedMessage: `${result.actionLabel} submitted…`,
            successMessage: `${result.actionLabel} confirmed.`,
            failureMessage: `${result.actionLabel} failed.`,
          });

          if (!confirmed) {
            setOutput(
              `❌ ${result.actionLabel} failed.\n\nCheck the linked transaction for details.`
            );
            return;
          }
        }

        setOutput(result.output);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `${ACTIVE_NEAR_NETWORK} execution failed`;
        setTxResult({
          type: 'error',
          msg: message,
        });
        setOutput(`❌ ${ACTIVE_NEAR_NETWORK} execution error:\n\n${message}`);
      } finally {
        setIsRunning(false);
      }
      return;
    }

    // Simulate execution (demo mode)
    setTimeout(() => {
      const blockedLiveRun = useLiveNetwork && !isConnected;
      const demoOutput = blockedLiveRun
        ? selectedNeedsOnApiSession
          ? `⚠️ Connect wallet to authorize OnAPI on ${ACTIVE_NEAR_NETWORK}.\n\n// This example uses SDK compose or indexed query endpoints.\n// The playground will request a short OnAPI session before live execution.\n\n// For now, showing demo output:\n`
          : `⚠️ Connect wallet to execute on ${ACTIVE_NEAR_NETWORK}!\n\n// Click "Connect Wallet" button above to:\n// 1. Connect your NEAR wallet\n// 2. Execute real transactions on ${ACTIVE_NEAR_NETWORK}\n// 3. Verify results on NEAR Explorer\n\n// For now, showing demo output:\n`
        : `✅ Code executed successfully! (Demo Mode)\n\n// Example output:\n// This is a simulation. To execute on real blockchain:\n// 1. Click "Connect Wallet" button above\n// 2. Enable live ${ACTIVE_NEAR_NETWORK} mode\n// 3. Run your code again\n\n`;
      const demoPayload = blockedLiveRun
        ? `{
  "mode": "demo",
  "status": "not_submitted",
  "requires": ${selectedNeedsOnApiSession ? '["wallet", "onapi_session"]' : '["wallet"]'},
  "note": "No transaction was submitted. Connect wallet and enable live ${ACTIVE_NEAR_NETWORK} mode for real execution."
}`
        : `{
  "mode": "demo",
  "status": "simulated_success",
  "simulated_tx_hash": "BvJeW6gnodVxA1H...",
  "block_height": 123456789,
  "gas_used": "2.4 Tgas",
  "note": "This is simulated output. Connect wallet and enable live ${ACTIVE_NEAR_NETWORK} mode for real execution."
}`;

      setOutput(demoOutput + demoPayload);
      setIsRunning(false);
    }, 1500);
  };

  const handleAuthorizeOnApi = async () => {
    await authorizeOnApiSession();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleReset = () => {
    setCode(selectedExample.code);
    setOutput('');
    setTxHash(null);
    setReset(true);
    setTimeout(() => setReset(false), 1000);
  };

  const filteredExamples =
    selectedCategory === 'all'
      ? playgroundExamples
      : playgroundExamples.filter((ex) => ex.category === selectedCategory);

  useEffect(() => {
    const exampleId = new URLSearchParams(window.location.search).get(
      'example'
    );
    if (!exampleId) return;

    const example = playgroundExamples.find((item) => item.id === exampleId);
    if (!example) return;

    setSelectedExample(example);
    setSelectedCategory(example.category);
    setCode(example.code);
    setOutput('');
  }, []);

  return (
    <PageShell size="wide">
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <SecondaryPageHeader
        badge="Playground"
        badgeAccent="purple"
        glowAccents={['purple', 'blue']}
        align="left"
        contentClassName="max-w-5xl"
        descriptionClassName="max-w-3xl"
        title="Try protocol flows in real time"
        description={`Explore example snippets, edit code live, and move from simulated runs into real NEAR ${ACTIVE_NEAR_NETWORK} execution when your wallet is connected.`}
      >
        <Link
          href="/sdk"
          className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/55 px-4 py-2 text-sm text-muted-foreground transition-all hover:border-border hover:text-foreground"
        >
          <Book className="h-4 w-4" />
          Documentation
        </Link>
        <a
          href="https://github.com/OnSocial-Labs/onsocial-protocol"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/55 px-4 py-2 text-sm text-muted-foreground transition-all hover:border-border hover:text-foreground"
        >
          <Github className="h-4 w-4" />
          GitHub
        </a>
        <Link
          href="/sdk#methods"
          className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/55 px-4 py-2 text-sm text-muted-foreground transition-all hover:border-border hover:text-foreground"
        >
          <Code2 className="h-4 w-4" />
          API Reference
        </Link>
      </SecondaryPageHeader>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-6"
      >
        <SurfacePanel radius="xl" tone="soft" padding="snug">
          <SectionHeader
            badge="Mode"
            title={liveReady ? `Live ${ACTIVE_NEAR_NETWORK}` : 'Demo mode'}
            size="compact"
          />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`h-2.5 w-2.5 rounded-full ${liveReady ? 'portal-green-dot animate-pulse' : 'bg-muted-foreground/40'}`}
              />
              <div className="text-sm text-muted-foreground">
                {liveReady
                  ? `Wallet ready for live ${ACTIVE_NEAR_NETWORK} calls.`
                  : 'Choose between simulated and live execution.'}
              </div>
            </div>
            <Button
              onClick={() => setUseLiveNetwork(!useLiveNetwork)}
              variant={
                liveReady
                  ? 'default'
                  : useLiveNetwork && !isConnected
                    ? 'outline'
                    : 'outline'
              }
              size="sm"
            >
              {useLiveNetwork
                ? `Disable live ${ACTIVE_NEAR_NETWORK}`
                : `Enable live ${ACTIVE_NEAR_NETWORK}`}
            </Button>
          </div>
          {useLiveNetwork && !isConnected && (
            <div className="mt-3 border-t border-fade-section pt-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Wallet className="h-4 w-4" />
                {selectedNeedsOnApiSession
                  ? `Connect your wallet to authorize OnAPI for this SDK example on NEAR ${ACTIVE_NEAR_NETWORK}.`
                  : `Public reads can run now. Connect your wallet to run write examples on NEAR ${ACTIVE_NEAR_NETWORK}.`}
              </p>
            </div>
          )}
          {liveReady && (
            <div className="mt-3 border-t border-fade-section pt-3">
              <p className="text-xs text-muted-foreground">
                Network:{' '}
                <span className="portal-green-text">{ACTIVE_NEAR_NETWORK}</span>{' '}
                ·{' '}
                <span className="portal-amber-text">
                  {ACTIVE_NEAR_NETWORK === 'mainnet'
                    ? 'Writes affect production state and may spend real NEAR.'
                    : 'Writes go through the OnSocial SDK and your wallet.'}
                </span>
              </p>
            </div>
          )}
          {liveReady && selectedNeedsOnApiSession && (
            <div className="mt-3 border-t border-fade-section pt-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
                  {hasOnApiSession ? (
                    <CheckCircle2 className="portal-green-icon h-4 w-4 shrink-0" />
                  ) : (
                    <Wallet className="h-4 w-4 shrink-0" />
                  )}
                  <span>
                    {hasOnApiSession
                      ? 'OnAPI session ready. SDK prepare and indexed query calls use this session.'
                      : 'OnAPI session pending. Authorize once with a wallet message; writes still ask your wallet to sign transactions.'}
                  </span>
                </p>
                {!hasOnApiSession && (
                  <Button
                    onClick={handleAuthorizeOnApi}
                    disabled={isAuthenticating}
                    variant="outline"
                    size="xs"
                  >
                    <ButtonLoadingContent
                      loading={isAuthenticating}
                      loadingIndicatorSize="sm"
                      contentClassName="inline-flex items-center gap-1.5"
                    >
                      <>
                        <Wallet className="h-3.5 w-3.5" />
                        Authorize OnAPI
                      </>
                    </ButtonLoadingContent>
                  </Button>
                )}
              </div>
            </div>
          )}
        </SurfacePanel>
      </motion.div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Examples */}
        <div className="lg:col-span-1">
          <SurfacePanel tone="muted" className="sticky top-24">
            <SectionHeader
              badge="Examples"
              size="compact"
              align="center"
              className="mb-4"
            />

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                onClick={() => setSelectedCategory('all')}
                variant={selectedCategory === 'all' ? 'default' : 'outline'}
                size="xs"
              >
                All
              </Button>
              {categories.map((cat) => {
                const IconComponent = cat.icon;
                return (
                  <Button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    variant={
                      selectedCategory === cat.id ? 'default' : 'outline'
                    }
                    size="xs"
                    title={cat.name}
                    className="gap-1.5"
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </Button>
                );
              })}
            </div>

            {/* Example List */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
              {filteredExamples.map((example) => (
                <button
                  key={example.id}
                  onClick={() => handleExampleSelect(example)}
                  className={`w-full text-left p-3 rounded-xl transition-all ${
                    selectedExample.id === example.id
                      ? 'portal-blue-surface border'
                      : 'portal-neutral-control border'
                  }`}
                >
                  <div className="font-medium mb-1">{example.title}</div>
                  <div className="text-xs opacity-80">
                    {example.description}
                  </div>
                </button>
              ))}
            </div>
          </SurfacePanel>
        </div>

        {/* Main Editor Area */}
        <div className="lg:col-span-3 space-y-6">
          {/* Selected Example Info */}
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={selectedExample.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-6"
            >
              <SurfacePanel tone="muted">
                <h3 className="text-foreground font-semibold text-xl mb-2 tracking-[-0.02em]">
                  {selectedExample.title}
                </h3>
                <p className="text-muted-foreground">
                  {selectedExample.description}
                </p>
              </SurfacePanel>

              {/* Code Editor */}
              <SurfacePanel
                tone="muted"
                padding="none"
                className="overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-fade-section">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Code2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Code Editor</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="p-2 rounded-lg bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                      title={copied ? 'Copied!' : 'Copy code'}
                    >
                      {copied ? (
                        <Check className="portal-green-icon w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={handleReset}
                      className="p-2 rounded-lg bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                      title={reset ? 'Reset!' : 'Reset to example'}
                    >
                      {reset ? (
                        <Check className="portal-green-icon w-4 h-4" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                    </button>
                    <Button
                      onClick={handleRun}
                      disabled={isRunning || isAuthenticating}
                      size="sm"
                    >
                      <ButtonLoadingContent
                        loading={isRunning || isAuthenticating}
                        loadingIndicatorSize="sm"
                        contentClassName="inline-flex items-center gap-2"
                      >
                        <>
                          <Play className="w-4 h-4" />
                          {runButtonLabel}
                        </>
                      </ButtonLoadingContent>
                    </Button>
                  </div>
                </div>
                <div className="h-[400px]">
                  <Editor
                    height="100%"
                    defaultLanguage="typescript"
                    path="onsocial-playground.mts"
                    value={code}
                    onChange={(value) => setCode(value || '')}
                    beforeMount={configurePlaygroundEditor}
                    theme={theme === 'dark' ? 'vs-dark' : 'light'}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 2,
                      wordWrap: 'on',
                      padding: { top: 16, bottom: 16 },
                    }}
                  />
                </div>
              </SurfacePanel>
            </motion.div>
          </AnimatePresence>

          {/* Output Panel */}
          <SurfacePanel tone="muted" padding="none" className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-fade-section text-muted-foreground">
              <Terminal className="w-4 h-4" />
              <span className="text-sm font-medium">Output</span>
            </div>
            <div className="p-4 min-h-[200px] max-h-[400px] overflow-y-auto">
              {output ? (
                <>
                  <pre className="text-sm text-muted-foreground font-mono whitespace-pre-wrap">
                    {output}
                  </pre>
                  {txHash && (
                    <div className="mt-4 pt-4 border-t border-fade-section">
                      <a
                        href={`${ACTIVE_NEAR_EXPLORER_URL}/txns/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="portal-action-link inline-flex items-center gap-2 text-sm transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View on NEAR Explorer
                      </a>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground text-sm">
                  <p className="mb-2">
                    Click "{runButtonLabel}" to execute your code.
                  </p>
                  <p className="text-xs">
                    💡 Tip:{' '}
                    {isConnected
                      ? `Enable live ${ACTIVE_NEAR_NETWORK} mode for real execution`
                      : `Connect wallet and enable live ${ACTIVE_NEAR_NETWORK} mode for real execution`}
                    .
                  </p>
                </div>
              )}
            </div>
          </SurfacePanel>

          {/* Info Card */}
          <SurfacePanel tone="muted" padding="roomy">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full border border-border/50">
                <CheckCircle2 className="portal-green-icon w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-foreground font-semibold mb-2 tracking-[-0.02em]">
                  About the Playground
                </h4>
                <p className="text-muted-foreground text-sm mb-3">
                  This playground lets you experiment with OnSocial Protocol.
                  Live execution follows the active portal network, so a testnet
                  portal runs against testnet and a mainnet portal runs against
                  mainnet.
                </p>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    •{' '}
                    {isConnected
                      ? `✅ ${ACTIVE_NEAR_NETWORK} wallet connected for live examples`
                      : `○ Connect wallet for real ${ACTIVE_NEAR_NETWORK} execution`}
                  </p>
                  <p>• All examples use TypeScript and the OnSocial SDK</p>
                  <p>
                    • Live SDK examples use an OnAPI wallet session; no API key
                    is created
                  </p>
                  <p>• Storage deposits are required for most operations</p>
                  <p>• Check the documentation for detailed API references</p>
                </div>
              </div>
            </div>
          </SurfacePanel>
        </div>
      </div>
    </PageShell>
  );
}

export default function PlaygroundPage() {
  return <PlaygroundContent />;
}
