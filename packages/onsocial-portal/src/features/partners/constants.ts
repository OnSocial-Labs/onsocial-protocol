import { Clock, Key, Users } from 'lucide-react';
import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';

export const BACKEND_URL = ACTIVE_BACKEND_URL;

export const AUDIENCE_BANDS = ['<1k', '1k-10k', '10k-50k', '50k+'] as const;

export type AudienceBand = (typeof AUDIENCE_BANDS)[number];

export const PARTNER_PER_USER_TERMS = {
  rewardPerAction: '0.1',
  dailyCap: '1',
} as const;

export const PARTNER_AUDIENCE_BAND_BUDGETS: Record<
  AudienceBand,
  {
    dailyBudget: string;
    totalBudget: string;
  }
> = {
  '<1k': {
    dailyBudget: '500',
    totalBudget: '50000',
  },
  '1k-10k': {
    dailyBudget: '2500',
    totalBudget: '250000',
  },
  '10k-50k': {
    dailyBudget: '7500',
    totalBudget: '750000',
  },
  '50k+': {
    dailyBudget: '15000',
    totalBudget: '1500000',
  },
};

export const STEPS = [
  {
    icon: Users,
    title: 'Apply',
    description:
      'Public project details, an audience band, and a shared starting draft.',
  },
  {
    icon: Clock,
    title: 'Propose',
    description: 'The final DAO proposal opens from the connected wallet.',
  },
  {
    icon: Key,
    title: 'Integrate',
    description:
      'Once the proposal is live on-chain, the API key becomes available.',
  },
] as const;
