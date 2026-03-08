'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import Editor from '@monaco-editor/react';
import { playgroundExamples, categories } from '@/data/playground-examples';
import type { ExampleSnippet } from '@/data/playground-examples';
import { Play, Copy, RotateCcw, Book, Github, Code2, Terminal, CheckCircle2, ExternalLink, Wallet, Check } from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { executeOnTestnet } from '@/lib/testnet-executor';

function PlaygroundContent() {
  const { accountId, isConnected, wallet, connect } = useWallet();
  const { theme } = useTheme();
  
  const [selectedExample, setSelectedExample] = useState<ExampleSnippet>(playgroundExamples[0]);
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
        const demoOutput = useTestnet && !isConnected
          ? `⚠️ Connect wallet to execute on testnet!\n\n// Click "Connect Wallet" button above to:\n// 1. Connect your NEAR wallet\n// 2. Execute real transactions on testnet\n// 3. Verify results on NEAR Explorer\n\n// For now, showing demo output:\n`
          : `✅ Code executed successfully! (Demo Mode)\n\n// Example output:\n// This is a simulation. To execute on real blockchain:\n// 1. Click "Connect Wallet" button above\n// 2. Enable "Testnet Mode" toggle\n// 3. Run your code again\n\n`;
        
        setOutput(demoOutput + `{\n  "status": "success",\n  "transaction_id": "BvJeW6gnodVxA1H...",\n  "block_height": 123456789,\n  "gas_used": "2.4 Tgas",\n  "note": "This is simulated output. Connect wallet and enable testnet for real execution."\n}`);
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

  const filteredExamples = selectedCategory === 'all' 
    ? playgroundExamples 
    : playgroundExamples.filter(ex => ex.category === selectedCategory);

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4 pb-1 tracking-[-0.03em]">
            OnSocial Playground
          </h1>
          <p className="text-muted-foreground text-lg max-w-3xl leading-relaxed">
            Experiment with OnSocial Protocol in real-time. Try out examples or write your own code to interact with the decentralized social platform.
          </p>
        </motion.div>

        {/* Quick Links */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-wrap gap-3 mb-6"
        >
          <a
            href="/docs"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-all bg-muted/30"
          >
            <Book className="w-4 h-4" />
            Documentation
          </a>
          <a
            href="https://github.com/OnSocial-Labs/onsocial-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-all bg-muted/30"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
          <a
            href="/docs/api"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-all bg-muted/30"
          >
            <Code2 className="w-4 h-4" />
            API Reference
          </a>
        </motion.div>

        {/* Execution Mode Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="border border-border/50 rounded-2xl p-4 mb-6 bg-muted/30"
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${useTestnet && isConnected ? 'bg-[#4ADE80] animate-pulse' : 'bg-muted-foreground/40'}`}></div>
              <div>
                <h3 className="text-foreground font-semibold tracking-[-0.02em]">
                  {useTestnet && isConnected ? '🚀 Testnet Mode (Real Execution)' : '📺 Demo Mode (Simulation)'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {useTestnet && isConnected
                    ? 'Code executes on NEAR testnet with your wallet' 
                    : useTestnet && !isConnected
                    ? 'Connect wallet to enable testnet execution'
                    : 'Code execution is simulated'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setUseTestnet(!useTestnet)}
                disabled={useTestnet && !isConnected}
                className={`px-4 py-2 rounded-full font-medium transition-all ${
                  useTestnet && isConnected
                    ? 'border border-[#3B82F6]/40 bg-[#3B82F6]/[0.06] text-foreground hover:border-[#3B82F6]/60 hover:shadow-md hover:shadow-[#3B82F6]/20'
                    : useTestnet && !isConnected
                    ? 'border border-border/50 bg-muted/50 text-muted-foreground cursor-not-allowed'
                    : 'border border-border/50 bg-muted/50 text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {useTestnet ? 'Disable Testnet' : 'Enable Testnet'}
              </button>
            </div>
          </div>
          {useTestnet && !isConnected && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Connect your wallet above to execute on NEAR testnet
              </p>
            </div>
          )}
          {useTestnet && isConnected && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                ⚠️ Testnet mode active • Network: <span className="text-[#4ADE80]">testnet</span> • <span className="text-yellow-500">Note: Deploy your contract first for real execution</span>
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
                <Terminal className="w-5 h-5 text-[#3B82F6]" />
                Examples
              </h2>

              {/* Category Filter */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1 rounded-full text-sm transition-all ${
                    selectedCategory === 'all'
                      ? 'border border-[#3B82F6]/40 bg-[#3B82F6]/[0.06] text-foreground'
                      : 'border border-border/50 bg-muted/50 text-muted-foreground hover:text-foreground hover:border-border'
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
                          ? 'border border-[#3B82F6]/40 bg-[#3B82F6]/[0.06] text-foreground'
                          : 'border border-border/50 bg-muted/50 text-muted-foreground hover:text-foreground hover:border-border'
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
                        ? 'border border-[#3B82F6]/40 bg-[#3B82F6]/[0.06] text-foreground'
                        : 'border border-border/50 bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground hover:border-border'
                    }`}
                  >
                    <div className="font-medium mb-1">{example.title}</div>
                    <div className="text-xs opacity-80">{example.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Editor Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Selected Example Info */}
            <div className="border border-border/50 rounded-2xl p-4 bg-muted/30">
              <h3 className="text-foreground font-semibold text-xl mb-2 tracking-[-0.02em]">{selectedExample.title}</h3>
              <p className="text-muted-foreground">{selectedExample.description}</p>
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
                    title={copied ? "Copied!" : "Copy code"}
                  >
                    {copied ? <Check className="w-4 h-4 text-[#4ADE80]" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleReset}
                    className="p-2 rounded-lg bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                    title={reset ? "Reset!" : "Reset to example"}
                  >
                    {reset ? <Check className="w-4 h-4 text-[#4ADE80]" /> : <RotateCcw className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleRun}
                    disabled={isRunning}
                    className="flex items-center gap-2 px-4 py-2 rounded-full border border-[#3B82F6]/40 bg-[#3B82F6]/[0.06] text-foreground hover:border-[#3B82F6]/60 hover:shadow-md hover:shadow-[#3B82F6]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
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
                    <pre className="text-sm text-muted-foreground font-mono whitespace-pre-wrap">{output}</pre>
                    {txHash && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <a
                          href={`https://testnet.nearblocks.io/txns/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-[#4ADE80] hover:text-[#4ADE80]/80 text-sm transition-colors"
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
                    <p className="text-xs">💡 Tip: {isConnected ? 'Enable testnet mode for real execution' : 'Connect wallet and enable testnet for real execution'}.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Info Card */}
            <div className="border border-border/50 rounded-2xl p-6 bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full border border-border/50">
                  <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
                </div>
                <div className="flex-1">
                  <h4 className="text-foreground font-semibold mb-2 tracking-[-0.02em]">About the Playground</h4>
                  <p className="text-muted-foreground text-sm mb-3">
                    This playground lets you experiment with OnSocial Protocol. Connect your wallet and enable testnet mode 
                    to execute real transactions on NEAR testnet blockchain.
                  </p>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>• {isConnected ? '✅' : '○'} Connect wallet for real testnet execution</p>
                    <p>• All examples use TypeScript and the OnSocial SDK</p>
                    <p>• Storage deposits are required for most operations</p>
                    <p>• Check the documentation for detailed API references</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlaygroundPage() {
  return <PlaygroundContent />;
}
