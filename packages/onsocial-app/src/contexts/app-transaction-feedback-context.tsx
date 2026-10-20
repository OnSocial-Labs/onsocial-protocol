'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';

type AppTransactionFeedbackContextValue = ReturnType<
  typeof useNearTransactionFeedback
>;

const AppTransactionFeedbackContext =
  createContext<AppTransactionFeedbackContextValue | null>(null);

export function AppTransactionFeedbackProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { accountId, sessionFeedback, clearSessionFeedback } = useAppWallet();
  const feedback = useNearTransactionFeedback(accountId);
  const result = sessionFeedback ?? feedback.txResult;

  return (
    <AppTransactionFeedbackContext.Provider value={feedback}>
      {children}
      <TransactionFeedbackToast
        result={result}
        onClose={
          sessionFeedback ? clearSessionFeedback : feedback.clearTxResult
        }
      />
    </AppTransactionFeedbackContext.Provider>
  );
}

export function useAppTransactionFeedback() {
  const context = useContext(AppTransactionFeedbackContext);
  if (!context) {
    throw new Error(
      'useAppTransactionFeedback must be used within AppTransactionFeedbackProvider'
    );
  }
  return context;
}
