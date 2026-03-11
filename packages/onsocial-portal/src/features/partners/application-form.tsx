'use client';

import { useState } from 'react';
import { ArrowRight, Shield } from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { Button } from '@/components/ui/button';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import type { ApplicationFormData } from '@/features/partners/types';

export function ApplicationForm({
  onSubmit,
}: {
  onSubmit: (_data: ApplicationFormData) => Promise<void>;
}) {
  const { accountId, connect } = useWallet();
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [expectedUsers, setExpectedUsers] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toSlug = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

  const appId = toSlug(label);
  const MAX_LABEL_LEN = 128;
  const MAX_APP_ID_LEN = 64;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!label.trim()) {
      setError('Project name is required');
      return;
    }
    if (label.trim().length > MAX_LABEL_LEN) {
      setError(`Project name too long (max ${MAX_LABEL_LEN} characters)`);
      return;
    }
    if (appId.length < 3) {
      setError('Project name is too short');
      return;
    }
    if (appId.length > MAX_APP_ID_LEN) {
      setError(
        `App ID too long (max ${MAX_APP_ID_LEN} characters) — try a shorter name`
      );
      return;
    }
    if (!accountId) {
      setError('Wallet not connected');
      return;
    }
    if (!description.trim()) {
      setError('Please tell us about your project');
      return;
    }
    if (!contact.trim()) {
      setError('Contact info is required so we can reach you');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        appId,
        label: label.trim(),
        description: description.trim(),
        expectedUsers: expectedUsers.trim(),
        contact: contact.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Application failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!accountId) {
    return (
      <div className="text-center py-12">
        <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
        <h3 className="text-xl font-semibold mb-2 tracking-[-0.02em]">
          Connect Your Wallet
        </h3>
        <p className="text-muted-foreground mb-6">
          Sign in with your NEAR wallet to apply as a partner.
        </p>
        <Button
          onClick={() => connect()}
          size="lg"
          className="font-semibold px-8"
        >
          Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-5">
      <div className="text-center mb-6">
        <p className="text-sm text-muted-foreground">
          Signed in as{' '}
          <span className="text-[#4ADE80] font-mono">{accountId}</span>
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Project Name *</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="My Community"
          maxLength={MAX_LABEL_LEN}
          className="w-full px-4 py-3 rounded-full bg-muted/40 border border-border/50 focus:border-border focus:ring-1 focus:ring-border outline-none transition-colors text-sm"
          required
        />
        {appId && (
          <p className="text-xs text-muted-foreground mt-1">
            App ID: <span className="font-mono text-[#60A5FA]">{appId}</span>
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Description *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell us about your project and why you want to reward your community with $SOCIAL."
          rows={3}
          className="w-full px-4 py-3 rounded-2xl bg-muted/40 border border-border/50 focus:border-border focus:ring-1 focus:ring-border outline-none transition-colors text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Community Size</label>
        <input
          type="text"
          value={expectedUsers}
          onChange={(e) => setExpectedUsers(e.target.value)}
          placeholder="e.g. 500 members, 2k followers, 10k monthly users"
          className="w-full px-4 py-3 rounded-full bg-muted/40 border border-border/50 focus:border-border focus:ring-1 focus:ring-border outline-none transition-colors text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Contact *</label>
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="@telegram, email, or X handle"
          className="w-full px-4 py-3 rounded-full bg-muted/40 border border-border/50 focus:border-border focus:ring-1 focus:ring-border outline-none transition-colors text-sm"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={
          submitting || !appId || !label || !description.trim() || !contact.trim()
        }
        size="lg"
        className="w-full font-semibold disabled:opacity-50"
      >
        {submitting ? (
          <>
            <PulsingDots size="sm" className="mr-2" />
            Submitting…
          </>
        ) : (
          <>
            Submit Application
            <ArrowRight className="w-4 h-4 ml-2" />
          </>
        )}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        Applications are reviewed within 24 hours. Reward rules are recorded
        on-chain for full transparency.
      </p>
    </form>
  );
}