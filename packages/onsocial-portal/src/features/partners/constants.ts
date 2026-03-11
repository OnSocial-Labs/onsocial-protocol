import { Clock, Key, Users } from 'lucide-react';

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://backend.onsocial.id';

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