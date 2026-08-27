'use client';

import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { ACTIVE_NEAR_NETWORK, PUBLIC_APP_URL } from '@/lib/portal-config';
import {
  communityDappContinueUrl,
  communityDappSnippet,
} from '@/features/onapi/community-dapp-snippet';

export function CommunityDappShipSnippet({ appId }: { appId: string }) {
  const snippet = communityDappSnippet({
    appId,
    osOrigin: PUBLIC_APP_URL,
    network: ACTIVE_NEAR_NETWORK,
  });
  const continueUrl = communityDappContinueUrl(PUBLIC_APP_URL, appId);
  const [copied, setCopied] = useState<'snippet' | 'url' | null>(null);

  const copy = useCallback(async (text: string, kind: 'snippet' | 'url') => {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }, []);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="portal-type-caption text-muted-foreground">
            Continue with OnSocial
          </p>
          <button
            type="button"
            aria-label="Copy continue URL"
            onClick={() => void copy(continueUrl, 'url')}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied === 'url' ? (
              <Check className="h-3.5 w-3.5 portal-green-text" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <code className="block break-all rounded-2xl border border-border/40 bg-background/45 px-3 py-2 font-mono text-xs">
          {continueUrl}
        </code>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="portal-type-caption text-muted-foreground">
            Paste into your dapp
          </p>
          <button
            type="button"
            aria-label="Copy starter snippet"
            onClick={() => void copy(snippet, 'snippet')}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied === 'snippet' ? (
              <Check className="h-3.5 w-3.5 portal-green-text" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <pre className="max-h-56 overflow-auto rounded-2xl border border-border/40 bg-background/45 px-3 py-2 font-mono text-xs leading-relaxed">
          {snippet}
        </pre>
      </div>
    </div>
  );
}
