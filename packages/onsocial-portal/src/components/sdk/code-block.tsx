'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import typescript from 'highlight.js/lib/languages/typescript';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);

export type CodeBlockLanguage = 'typescript' | 'json' | 'bash';

/**
 * Shared docs code block. Syntax-highlights with highlight.js (token colors
 * live in globals.css), wraps long lines (mobile-first), and offers a
 * clipboard copy button in the corner. Copy always uses the raw source.
 */
export function CodeBlock({
  code,
  lang = 'typescript',
  className,
}: {
  code: string;
  lang?: CodeBlockLanguage;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const highlighted = useMemo(() => {
    try {
      return hljs.highlight(code, { language: lang }).value;
    } catch {
      return null;
    }
  }, [code, lang]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(true);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className={cn('group relative mt-4', className)}>
      <pre className="rounded-[0.9rem] border border-border/35 bg-background/60 px-4 py-3 pr-11 text-xs leading-6 text-foreground/85 md:text-sm">
        {highlighted === null ? (
          <code className="whitespace-pre-wrap break-words">{code}</code>
        ) : (
          <code
            className="hljs whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        )}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-[0.55rem] border border-border/40 bg-background/85 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/60"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
