'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PageShell } from '@/components/layout/page-shell';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { useWallet } from '@/contexts/wallet-context';
import { checkStatus, submitApplication } from '@/features/partners/api';
import { ApplicationForm } from '@/features/partners/application-form';
import { STEPS } from '@/features/partners/constants';
import {
  ApprovedDashboard,
  PendingState,
  RejectedState,
} from '@/features/partners/states';
import type {
  AppRegistration,
  ApplicationFormData,
  Step,
} from '@/features/partners/types';
import { StepIndicator } from '@/features/partners/ui-helpers';

export default function PartnersPage() {
  const { accountId } = useWallet();
  const [step, setStep] = useState<Step>('apply');
  const [registration, setRegistration] = useState<AppRegistration | null>(null);
  const [pendingApp, setPendingApp] = useState<{ appId: string; label: string } | null>(
    null
  );
  const [pageError, setPageError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetState = useCallback(() => {
    setStep('apply');
    setRegistration(null);
    setPendingApp(null);
    setPageError('');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!accountId) {
      resetState();
      return;
    }

    let cancelled = false;
    setLoading(true);

    checkStatus(accountId)
      .then((data) => {
        if (cancelled) return;

        if (data.status === 'approved' && data.api_key) {
          setRegistration({
            appId: data.app_id!,
            apiKey: data.api_key,
            label: data.label!,
          });
          setStep('approved');
        } else if (data.status === 'pending') {
          setPendingApp({ appId: data.app_id!, label: data.label! });
          setStep('pending');
        } else if (data.status === 'rejected') {
          setPendingApp({ appId: data.app_id!, label: data.label! });
          setStep('rejected');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, resetState]);

  const handleApply = useCallback(
    async (data: ApplicationFormData) => {
      if (!accountId) throw new Error('Wallet not connected');

      setPageError('');
      setStep('submitting');

      try {
        const result = await submitApplication({
          app_id: data.appId,
          label: data.label,
          description: data.description,
          expected_users: data.expectedUsers,
          contact: data.contact,
          wallet_id: accountId,
        });

        setPendingApp({ appId: result.app_id, label: result.label });
        setStep('pending');
      } catch (err) {
        setPageError(err instanceof Error ? err.message : 'Application failed');
        setStep('apply');
      }
    },
    [accountId]
  );

  const currentStep =
    step === 'apply' || step === 'submitting'
      ? 0
      : step === 'pending'
        ? 1
        : step === 'approved'
          ? 2
          : 0;

  return (
    <PageShell className="max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-10 px-2 py-4 text-center md:py-6"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70 blur-3xl"
          style={{
            background:
              'radial-gradient(circle at 50% 20%, rgba(96,165,250,0.18), transparent 45%), radial-gradient(circle at 75% 25%, rgba(74,222,128,0.12), transparent 38%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-3xl">
          <h1 className="mb-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">
            Grow together
            <br />
            <span className="portal-green-text">With SOCIAL rewards</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            Launch on-chain incentives for your Telegram group or app.
          </p>
        </div>
      </motion.div>

      <div className="mb-8 rounded-[1.5rem] border border-border/50 bg-background/30 px-4 py-5 md:px-6">
        <StepIndicator steps={STEPS} current={currentStep} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-8"
      >
        {loading && (
          <div className="text-center py-12">
            <div className="portal-blue-text mb-4">
              <PulsingDots size="lg" />
            </div>
            <p className="text-sm text-muted-foreground">
              Checking application status…
            </p>
          </div>
        )}
        {!loading && step === 'apply' && <ApplicationForm onSubmit={handleApply} />}
        {!loading && step === 'apply' && pageError && (
          <p className="portal-red-panel portal-red-text rounded-lg px-4 py-2 mt-4 text-center text-sm">
            {pageError}
          </p>
        )}
        {step === 'submitting' && (
          <div className="text-center py-12">
            <div className="portal-blue-text mb-4">
              <PulsingDots size="lg" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Submitting application…</h3>
          </div>
        )}
        {step === 'pending' && pendingApp && (
          <PendingState appId={pendingApp.appId} label={pendingApp.label} />
        )}
        {step === 'rejected' && pendingApp && (
          <RejectedState appId={pendingApp.appId} label={pendingApp.label} />
        )}
        {step === 'approved' && registration && (
          <ApprovedDashboard
            registration={registration}
            onKeyRotated={(newKey) =>
              setRegistration((prev) => (prev ? { ...prev, apiKey: newKey } : prev))
            }
          />
        )}
      </motion.div>
    </PageShell>
  );
}
