import type { Application } from '@/features/admin/types';

export async function fetchApplications(wallet: string): Promise<Application[]> {
  const res = await fetch(`/api/admin?wallet=${encodeURIComponent(wallet)}`);
  if (!res.ok) throw new Error('Failed to fetch applications');
  const data = (await res.json()) as {
    success: boolean;
    applications: Application[];
  };
  return data.applications;
}

export async function approveApp(
  wallet: string,
  appId: string,
  notes: string
): Promise<{ api_key: string }> {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet,
      action: 'approve',
      appId,
      admin_notes: notes,
    }),
  });
  if (!res.ok) throw new Error('Approval failed');
  return (await res.json()) as { api_key: string };
}

export async function rejectApp(
  wallet: string,
  appId: string,
  notes: string
): Promise<void> {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet,
      action: 'reject',
      appId,
      admin_notes: notes,
    }),
  });
  if (!res.ok) throw new Error('Rejection failed');
}