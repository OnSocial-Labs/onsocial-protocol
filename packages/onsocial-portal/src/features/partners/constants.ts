import { Clock, Key, Users } from 'lucide-react';
import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';

export const BACKEND_URL = ACTIVE_BACKEND_URL;

export const STEPS = [
  {
    icon: Users,
    title: 'Apply',
    description: 'Connect wallet and tell us about your project.',
  },
  {
    icon: Clock,
    title: 'Review',
    description: 'OnSocial team reviews your application.',
  },
  {
    icon: Key,
    title: 'Integrate',
    description: 'Get your OnApi key and integrate the SDK.',
  },
] as const;