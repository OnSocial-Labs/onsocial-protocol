'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
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
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { executeOnTestnet } from '@/lib/testnet-executor';

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

function PlaygroundContent() {
  const { accountId, isConnected, wallet } = useWallet();
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
  const [useTestnet, setUseTestnet] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reset, setReset] = useState(false);

  const handleExampleSelect = (example: ExampleSnippet) => {
    setSelectedExample(example);
    setCode(example.code);
    setOutput('');
  };

  const handleRun = async () => {
    setIsRunning(true);
    setOutput('⏳ Running code...\n\n');
    setTxHash(null);
    clearTxResult();

    if (useTestnet && isConnected && wallet) {
      // Execute on NEAR testnet with connected wallet
      try {
        const result = await executeOnTestnet(code, accountId!, wallet);
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

        if (result.txHash && result.actionLabel) {
          setTxHash(result.txHash);
          setOutput('⏳ Submitting transaction…\n\n');

          const confirmed = await trackTransaction({
            txHashes: [result.txHash],
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
      } catch (error: any) {
        setTxResult({
          type: 'error',
          msg:
            error instanceof Error ? error.message : 'Testnet execution failed',
        });
        setOutput(`❌ Testnet execution error:\n\n${error.message}`);
      } finally {
        setIsRunning(false);
      }
    } else {
      // Simulate execution (demo mode)
      setTimeout(() => {
        const demoOutput =
          useTestnet && !isConnected
            ? `⚠️ Connect wallet to execute on testnet!\n\n// Click "Connect Wallet" button above to:\n// 1. Connect your NEAR wallet\n// 2. Execute real transactions on testnet\n// 3. Verify results on NEAR Explorer\n\n// For now, showing demo output:\n`
            : `✅ Code executed successfully! (Demo Mode)\n\n// Example output:\n// This is a simulation. To execute on real blockchain:\n// 1. Click "Connect Wallet" button above\n// 2. Enable "Testnet Mode" toggle\n// 3. Run your code again\n\n`;

        setOutput(
          demoOutput +
            `{\n  "status": "success",\n  "transaction_id": "BvJeW6gnodVxA1H...",\n  "block_height": 123456789,\n  "gas_used": "2.4 Tgas",\n  "note": "This is simulated output. Connect wallet and enable testnet for real execution."\n}`
        );
        setIsRunning(false);
      }, 1500);
    }
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
        description="Explore example snippets, edit code live, and move from simulated runs into real NEAR testnet execution when your wallet is connected."
      >
        <a
          href="/docs"
          className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/55 px-4 py-2 text-sm text-muted-foreground transition-all hover:border-border hover:text-foreground"
        >
          <Book className="h-4 w-4" />
          Documentation
        </a>
        <a
          href="https://github.com/OnSocial-Labs/onsocial-protocol"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/55 px-4 py-2 text-sm text-muted-foreground transition-all hover:border-border hover:text-foreground"
        >
          <Github className="h-4 w-4" />
          GitHub
        </a>
        <a
          href="/docs/api"
          className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/55 px-4 py-2 text-sm text-muted-foreground transition-all hover:border-border hover:text-foreground"
        >
          <Code2 className="h-4 w-4" />
          API Reference
        </a>
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
            title={useTestnet && isConnected ? 'Testnet mode' : 'Demo mode'}
            size="compact"
          />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`h-2.5 w-2.5 rounded-full ${useTestnet && isConnected ? 'portal-green-dot animate-pulse' : 'bg-muted-foreground/40'}`}
              />
              <div className="text-sm text-muted-foreground">
                {useTestnet && isConnected
                  ? 'Wallet ready for live testnet calls.'
                  : 'Choose between simulated and live execution.'}
              </div>
            </div>
            <Button
              onClick={() => setUseTestnet(!useTestnet)}
              disabled={useTestnet && !isConnected}
              variant={
                useTestnet && isConnected
                  ? 'default'
                  : useTestnet && !isConnected
                    ? 'outline'
                    : 'outline'
              }
              size="sm"
              className={
                useTestnet && !isConnected
                  ? 'cursor-not-allowed opacity-50'
                  : ''
              }
            >
              {useTestnet ? 'Disable testnet' : 'Enable testnet'}
            </Button>
          </div>
          {useTestnet && !isConnected && (
            <div className="mt-3 border-t border-fade-section pt-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Wallet className="h-4 w-4" />
                Connect your wallet above to execute on NEAR testnet.
              </p>
            </div>
          )}
          {useTestnet && isConnected && (
            <div className="mt-3 border-t border-fade-section pt-3">
              <p className="text-xs text-muted-foreground">
                Network: <span className="portal-green-text">testnet</span> ·{' '}
                <span className="portal-amber-text">
                  Deploy your contract first for real execution.
                </span>
              </p>
            </div>
          )}
        </SurfacePanel>
      </motion.div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Examples */}
        <div className="lg:col-span-1">
          <SurfacePanel tone="muted" className="sticky top-24">
            <SectionHeader badge="Examples" size="compact" align="center" className="mb-4" />

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
                    <Button onClick={handleRun} disabled={isRunning} size="sm">
                      <ButtonLoadingContent
                        loading={isRunning}
                        loadingIndicatorSize="sm"
                        contentClassName="inline-flex items-center gap-2"
                      >
                        <>
                          <Play className="w-4 h-4" />
                          Run Code
                        </>
                      </ButtonLoadingContent>
                    </Button>
                  </div>
                </div>
                <div className="h-[400px]">
                  <Editor
                    height="100%"
                    defaultLanguage="typescript"
                    value={code}
                    onChange={(value) => setCode(value || '')}
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
                        href={`https://testnet.nearblocks.io/txns/${txHash}`}
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
                  <p className="mb-2">Click "Run Code" to execute your code.</p>
                  <p className="text-xs">
                    💡 Tip:{' '}
                    {isConnected
                      ? 'Enable testnet mode for real execution'
                      : 'Connect wallet and enable testnet for real execution'}
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
                  Connect your wallet and enable testnet mode to execute real
                  transactions on NEAR testnet blockchain.
                </p>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    • {isConnected ? '✅' : '○'} Connect wallet for real testnet
                    execution
                  </p>
                  <p>• All examples use TypeScript and the OnSocial SDK</p>
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
