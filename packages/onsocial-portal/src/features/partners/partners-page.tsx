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
    <PageShell>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-16"
      >
        <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-[-0.03em]">
          Partner Integration
        </h1>
        <p className="text-lg text-muted-foreground max-w-lg mx-auto">
          Reward your community with $SOCIAL tokens — fully on-chain, gasless,
          and live in minutes.
        </p>
      </motion.div>

      <StepIndicator steps={STEPS} current={currentStep} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="border border-border/50 rounded-2xl p-8 bg-muted/30"
      >
        {loading && (
          <div className="text-center py-12">
            <div className="mb-4 text-[#60A5FA]">
              <PulsingDots size="lg" />
            </div>
            <p className="text-sm text-muted-foreground">
              Checking application status…
            </p>
          </div>
        )}
        {!loading && step === 'apply' && <ApplicationForm onSubmit={handleApply} />}
        {!loading && step === 'apply' && pageError && (
          <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2 mt-4 text-center">
            {pageError}
          </p>
        )}
        {step === 'submitting' && (
          <div className="text-center py-12">
            <div className="mb-4 text-[#60A5FA]">
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
