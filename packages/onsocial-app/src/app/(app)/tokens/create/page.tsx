import type { Metadata } from 'next';
import { CreateTokenPanel } from '@/features/tokens/create-token-panel';

export const metadata: Metadata = {
  title: 'Create token • OnSocial',
  description: 'Deploy your own fungible token under your NEAR account.',
};

export default function CreateTokenPage() {
  return <CreateTokenPanel />;
}
