'use client';

import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { portalColors } from '@/lib/portal-colors';

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
      type="button"
      onClick={handleCopy}
      className={`p-1.5 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground ${extraClass ?? 'absolute top-3 right-3'}`}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-4 h-4" style={{ color: portalColors.green }} />
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
    <Button
      type="button"
      onClick={handleDownload}
      className="h-auto gap-1.5 px-3 py-1.5 text-xs"
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </Button>
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
      <pre className="bg-muted/40 rounded-[1rem] p-4 overflow-x-auto text-sm font-mono text-muted-foreground border border-border/50">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

const STEP_COLORS = [
  portalColors.green,
  portalColors.blue,
  portalColors.purple,
] as const;

export function StepIndicator({
  steps,
  current,
}: {
  steps: readonly { icon: LucideIcon; title: string; description: string }[];
  current: number;
}) {
  return (
    <div className="flex items-center justify-center">
      {steps.map((step, index) => {
        const color = STEP_COLORS[index % 3];
        const active = index <= current;
        return (
          <div key={index} className="flex items-center">
            {index > 0 && (
              <div
                className={`mx-1.5 h-px w-10 sm:w-16 md:w-20 transition-colors ${
                  index <= current ? '' : 'bg-border/50'
                }`}
                style={
                  index <= current
                    ? { backgroundColor: STEP_COLORS[(index - 1) % 3] }
                    : undefined
                }
              />
            )}
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background/60 transition-all md:h-10 md:w-10 ${
                active
                  ? 'border-border shadow-sm'
                  : 'border-border/50 text-muted-foreground'
              }`}
              style={active ? { color, borderColor: `${color}40` } : undefined}
            >
              {index < current ? (
                <CheckCircle2 className="h-[1.125rem] w-[1.125rem] md:h-5 md:w-5" />
              ) : (
                <step.icon className="h-[1.125rem] w-[1.125rem] md:h-5 md:w-5" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
