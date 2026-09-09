import type { Metadata } from 'next';
import { DaoCreatePanel } from '@/features/protocol/dao-create-panel';

export const metadata: Metadata = {
  title: 'Create DAO • OnSocial',
  description: 'Create an OnSocial DAO under the network factory.',
};

export default function CreateDaoPage() {
  return <DaoCreatePanel />;
}
