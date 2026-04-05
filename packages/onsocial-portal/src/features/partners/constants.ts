import { Clock, Key, Users } from 'lucide-react';

export const PARTNERS_API_BASE = '/api/partners';

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
      'Share your program, community size, and starting terms for review.',
  },
  {
    icon: Clock,
    title: 'Propose',
    description: 'Open the on-chain proposal from the connected wallet.',
  },
  {
    icon: Key,
    title: 'Integrate',
    description:
      'Once approved on-chain, your program can go live with API access.',
  },
] as const;
