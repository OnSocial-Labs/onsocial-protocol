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
        <Shield className="mx-auto mb-4 h-16 w-16 text-muted-foreground/40" />
        <h3 className="mb-2 text-xl font-semibold tracking-[-0.02em]">
          Connect Your Wallet
        </h3>
        <p className="mb-6 text-muted-foreground">
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
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-6">
      <div className="mb-1 flex items-center justify-center">
        <p className="rounded-full border border-border/50 bg-muted/20 px-4 py-2 text-sm text-muted-foreground">
          Signed in as{' '}
          <span className="font-mono text-foreground">{accountId}</span>
        </p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Project Name
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="My Community"
          maxLength={MAX_LABEL_LEN}
          className="portal-blue-focus w-full rounded-2xl border border-border/60 bg-muted/20 px-4 py-3.5 text-sm outline-none"
          required
        />
        {appId && (
          <p className="mt-2 text-xs text-muted-foreground">
            App ID: <span className="font-mono text-foreground/85">{appId}</span>
          </p>
        )}
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell us about your project and why you want to reward your community with $SOCIAL."
          rows={3}
          className="portal-blue-focus w-full resize-none rounded-2xl border border-border/60 bg-muted/20 px-4 py-3.5 text-sm outline-none"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Community Size
        </label>
        <input
          type="text"
          value={expectedUsers}
          onChange={(e) => setExpectedUsers(e.target.value)}
          placeholder="e.g. 500 members, 2k followers, 10k monthly users"
          className="portal-blue-focus w-full rounded-2xl border border-border/60 bg-muted/20 px-4 py-3.5 text-sm outline-none"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Contact
        </label>
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="@telegram, email, or X handle"
          className="portal-blue-focus w-full rounded-2xl border border-border/60 bg-muted/20 px-4 py-3.5 text-sm outline-none"
        />
      </div>

      {error && (
        <div className="portal-red-panel portal-red-text rounded-2xl border px-4 py-3 text-sm">
          {error}
        </div>
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

      <p className="text-center text-xs text-muted-foreground">
        Applications are reviewed within 24 hours. Reward rules are recorded
        on-chain for full transparency.
      </p>
    </form>
  );
}