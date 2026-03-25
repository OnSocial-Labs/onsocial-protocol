'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import Editor from '@monaco-editor/react';
import { playgroundExamples, categories } from '@/data/playground-examples';
import type { ExampleSnippet } from '@/data/playground-examples';
import { PageShell } from '@/components/layout/page-shell';
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
import { executeOnTestnet } from '@/lib/testnet-executor';
import { portalBadgeStyle } from '@/lib/portal-colors';

function PlaygroundContent() {
  const { accountId, isConnected, wallet } = useWallet();
  const { theme } = useTheme();

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

    if (useTestnet && isConnected && wallet) {
      // Execute on NEAR testnet with connected wallet
      try {
        const result = await executeOnTestnet(code, accountId!, wallet);
        setOutput(result.output);
        if (result.txHash) {
          setTxHash(result.txHash);
        }
      } catch (error: any) {
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-8 px-2 py-4 md:py-6"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70 blur-3xl"
          style={{
            background:
              'radial-gradient(circle at 22% 18%, rgba(96,165,250,0.18), transparent 38%), radial-gradient(circle at 56% 20%, rgba(74,222,128,0.12), transparent 34%), radial-gradient(circle at 82% 24%, rgba(192,132,252,0.14), transparent 30%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-4xl">
          <div className="mb-4 flex justify-center md:justify-start">
            <span
              className="rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em]"
              style={portalBadgeStyle('blue')}
            >
              Interactive sandbox
            </span>
          </div>
          <h1 className="max-w-3xl text-4xl font-bold tracking-[-0.03em] md:text-5xl">
            Try protocol flows in real time
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Explore example snippets, edit code live, and move from simulated
            runs into real NEAR testnet execution when your wallet is connected.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
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
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-6 rounded-[1.5rem] border border-border/50 bg-background/40 p-4 md:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`h-2.5 w-2.5 rounded-full ${useTestnet && isConnected ? 'portal-green-dot animate-pulse' : 'bg-muted-foreground/40'}`}
            />
            <div>
              <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">
                {useTestnet && isConnected ? 'Testnet mode' : 'Demo mode'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {useTestnet && isConnected
                  ? 'Run code on NEAR testnet with your connected wallet.'
                  : useTestnet && !isConnected
                    ? 'Connect a wallet first to unlock real testnet execution.'
                    : 'Use simulated execution while you explore examples and edit code.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setUseTestnet(!useTestnet)}
            disabled={useTestnet && !isConnected}
            className={`rounded-full px-4 py-2 font-medium transition-all ${
              useTestnet && isConnected
                ? 'portal-blue-surface border'
                : useTestnet && !isConnected
                  ? 'cursor-not-allowed border border-border/50 bg-muted/50 text-muted-foreground'
                  : 'portal-neutral-control border'
            }`}
          >
            {useTestnet ? 'Disable testnet' : 'Enable testnet'}
          </button>
        </div>
        {useTestnet && !isConnected && (
          <div className="mt-3 border-t border-border/50 pt-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wallet className="h-4 w-4" />
              Connect your wallet above to execute on NEAR testnet.
            </p>
          </div>
        )}
        {useTestnet && isConnected && (
          <div className="mt-3 border-t border-border/50 pt-3">
            <p className="text-xs text-muted-foreground">
              Network: <span className="portal-green-text">testnet</span> ·{' '}
              <span className="portal-amber-text">
                Deploy your contract first for real execution.
              </span>
            </p>
          </div>
        )}
      </motion.div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Examples */}
        <div className="lg:col-span-1">
          <div className="border border-border/50 rounded-2xl p-4 sticky top-24 bg-muted/30">
            <h2 className="text-foreground font-semibold mb-4 flex items-center gap-2">
              <Terminal className="portal-blue-icon w-5 h-5" />
              Examples
            </h2>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1 rounded-full text-sm transition-all ${
                  selectedCategory === 'all'
                    ? 'portal-blue-surface border'
                    : 'portal-neutral-control border'
                }`}
              >
                All
              </button>
              {categories.map((cat) => {
                const IconComponent = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1 rounded-full text-sm transition-all flex items-center gap-1.5 ${
                      selectedCategory === cat.id
                        ? 'portal-blue-surface border'
                        : 'portal-neutral-control border'
                    }`}
                    title={cat.name}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </button>
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
          </div>
        </div>

        {/* Main Editor Area */}
        <div className="lg:col-span-3 space-y-6">
          {/* Selected Example Info */}
          <div className="border border-border/50 rounded-2xl p-4 bg-muted/30">
            <h3 className="text-foreground font-semibold text-xl mb-2 tracking-[-0.02em]">
              {selectedExample.title}
            </h3>
            <p className="text-muted-foreground">
              {selectedExample.description}
            </p>
          </div>

          {/* Code Editor */}
          <div className="border border-border/50 rounded-2xl overflow-hidden bg-muted/30">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
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
                <button
                  onClick={handleRun}
                  disabled={isRunning}
                  className="portal-blue-surface flex items-center gap-2 rounded-full border px-4 py-2 font-medium transition-all disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  {isRunning ? 'Running...' : 'Run Code'}
                </button>
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
          </div>

          {/* Output Panel */}
          <div className="border border-border/50 rounded-2xl overflow-hidden bg-muted/30">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 text-muted-foreground">
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
                    <div className="mt-4 pt-4 border-t border-border/50">
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
          </div>

          {/* Info Card */}
          <div className="border border-border/50 rounded-2xl p-6 bg-muted/30">
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
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export default function PlaygroundPage() {
  return <PlaygroundContent />;
}
