'use client';

import { useState } from 'react';
import { Check, CheckCircle2, Copy, Download, type LucideIcon } from 'lucide-react';

export function CopyButton({
  text,
  className: extraClass,
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground ${extraClass ?? 'absolute top-3 right-3'}`}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-4 h-4 text-[#4ADE80]" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  );
}

export function DownloadButton({
  filename,
  content,
  label,
}: {
  filename: string;
  content: string;
  label: string;
}) {
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleDownload}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border/50 bg-muted/40 hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

export function CodeBlock({
  code,
  language = 'typescript',
}: {
  code: string;
  language?: string;
}) {
  return (
    <div className="relative group">
      <pre className="bg-muted/40 rounded-xl p-4 overflow-x-auto text-sm font-mono text-muted-foreground border border-border/50">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

const STEP_COLORS = ['#4ADE80', '#60A5FA', '#C084FC'] as const;

export function StepIndicator({
  steps,
  current,
}: {
  steps: readonly { icon: LucideIcon; title: string; description: string }[];
  current: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2 mb-12">
      {steps.map((step, index) => {
        const color = STEP_COLORS[index % 3];
        const active = index <= current;
        return (
          <div key={index} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all ${
                active
                  ? 'border-border'
                  : 'border-border/50 text-muted-foreground'
              }`}
              style={active ? { color, borderColor: `${color}40` } : undefined}
            >
              {index < current ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <step.icon className="w-5 h-5" />
              )}
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-16 h-0.5 transition-colors ${
                  index < current ? '' : 'bg-border/50'
                }`}
                style={index < current ? { backgroundColor: color } : undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}