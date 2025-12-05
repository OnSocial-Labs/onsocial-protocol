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
  const { accountId, isConnected, selector } = useWallet();
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
    
    if (useTestnet && isConnected && selector) {
      // Execute on NEAR testnet with connected wallet
      try {
        const result = await executeOnTestnet(code, accountId!, selector);
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
    <div className="min-h-screen bg-gray-50 dark:bg-[#131313] pt-24 pb-16">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4 pb-1 bg-gradient-to-r from-[#00ec96] to-[#A05CFF] bg-clip-text text-transparent">
            OnSocial Playground
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg max-w-3xl leading-relaxed">
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-[#1A1E23] text-gray-900 dark:text-white hover:bg-[#00ec96] hover:text-[#131313] transition-all duration-300 hover:shadow-lg hover:shadow-[#00ec96]/20"
          >
            <Book className="w-4 h-4" />
            Documentation
          </a>
          <a
            href="https://github.com/OnSocial-Labs/onsocial-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-[#1A1E23] text-gray-900 dark:text-white hover:bg-[#00ec96] hover:text-[#131313] transition-all duration-300 hover:shadow-lg hover:shadow-[#00ec96]/20"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
          <a
            href="/docs/api"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-[#1A1E23] text-gray-900 dark:text-white hover:bg-[#00ec96] hover:text-[#131313] transition-all duration-300 hover:shadow-lg hover:shadow-[#00ec96]/20"
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
          className="bg-white dark:bg-[#1A1E23] rounded-xl p-4 mb-6 border border-[#00ec96]/20"
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${useTestnet && isConnected ? 'bg-[#00ec96] animate-pulse' : 'bg-gray-600'}`}></div>
              <div>
                <h3 className="text-gray-900 dark:text-white font-semibold">
                  {useTestnet && isConnected ? '🚀 Testnet Mode (Real Execution)' : '📺 Demo Mode (Simulation)'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
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
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  useTestnet && isConnected
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : useTestnet && !isConnected
                    ? 'bg-gray-200 dark:bg-[#131313] text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-200 dark:bg-[#131313] text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-300 dark:hover:bg-[#252525]'
                }`}
              >
                {useTestnet ? 'Disable Testnet' : 'Enable Testnet'}
              </button>
            </div>
          </div>
          {useTestnet && !isConnected && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-400 flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Connect your wallet above to execute on NEAR testnet
              </p>
            </div>
          )}
          {useTestnet && isConnected && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-400">
                ⚠️ Testnet mode active • Network: <span className="text-[#00ec96]">testnet</span> • <span className="text-yellow-500">Note: Deploy your contract first for real execution</span>
              </p>
            </div>
          )}
        </motion.div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Examples */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-[#1A1E23] rounded-xl p-4 sticky top-24 border border-gray-200 dark:border-gray-800">
              <h2 className="text-gray-900 dark:text-white font-semibold mb-4 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-[#00ec96]" />
                Examples
              </h2>

              {/* Category Filter */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-gray-200 dark:bg-[#131313] text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
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
                      className={`px-3 py-1 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
                        selectedCategory === cat.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-gray-200 dark:bg-[#131313] text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
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
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedExample.id === example.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-gray-200 dark:bg-[#131313] text-gray-700 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-[#252525] hover:text-gray-900 dark:hover:text-white'
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
            <div className="bg-white dark:bg-[#1A1E23] rounded-xl p-4 border border-gray-200 dark:border-gray-800">
              <h3 className="text-gray-900 dark:text-white font-semibold text-xl mb-2">{selectedExample.title}</h3>
              <p className="text-gray-600 dark:text-gray-400">{selectedExample.description}</p>
            </div>

            {/* Code Editor */}
            <div className="bg-white dark:bg-[#1A1E23] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 dark:border-gray-800">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Code2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Code Editor</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="p-2 rounded-lg bg-gray-200 dark:bg-[#131313] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    title={copied ? "Copied!" : "Copy code"}
                  >
                    {copied ? <Check className="w-4 h-4 text-[#00ec96]" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleReset}
                    className="p-2 rounded-lg bg-gray-200 dark:bg-[#131313] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    title={reset ? "Reset!" : "Reset to example"}
                  >
                    {reset ? <Check className="w-4 h-4 text-[#00ec96]" /> : <RotateCcw className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleRun}
                    disabled={isRunning}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
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
            <div className="bg-white dark:bg-[#1A1E23] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-300 dark:border-gray-800 text-gray-600 dark:text-gray-400">
                <Terminal className="w-4 h-4" />
                <span className="text-sm font-medium">Output</span>
              </div>
              <div className="p-4 min-h-[200px] max-h-[400px] overflow-y-auto">
                {output ? (
                  <>
                    <pre className="text-sm text-gray-800 dark:text-gray-300 font-mono whitespace-pre-wrap">{output}</pre>
                    {txHash && (
                      <div className="mt-4 pt-4 border-t border-gray-800">
                        <a
                          href={`https://testnet.nearblocks.io/txns/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-[#00ec96] hover:text-[#00d484] text-sm transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View on NEAR Explorer
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-gray-500 dark:text-gray-500 text-sm">
                    <p className="mb-2">Click "Run Code" to execute your code.</p>
                    <p className="text-xs">💡 Tip: {isConnected ? 'Enable testnet mode for real execution' : 'Connect wallet and enable testnet for real execution'}.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-white dark:bg-[#1A1E23] rounded-xl p-6 border border-[#00ec96]/20">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[#00ec96]/10">
                  <CheckCircle2 className="w-5 h-5 text-[#00ec96]" />
                </div>
                <div className="flex-1">
                  <h4 className="text-gray-900 dark:text-white font-semibold mb-2">About the Playground</h4>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                    This playground lets you experiment with OnSocial Protocol. Connect your wallet and enable testnet mode 
                    to execute real transactions on NEAR testnet blockchain.
                  </p>
                  <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
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
