import { BACKEND_URL } from '@/features/partners/constants';
import type {
  ApplyBody,
  ApplyResponse,
  RotateResponse,
  StatusResponse,
} from '@/features/partners/types';

export async function rotateKey(
  walletId: string,
  currentKey: string
): Promise<RotateResponse> {
  const res = await fetch(`${BACKEND_URL}/v1/admin/rotate-key/${walletId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': currentKey,
    },
  });
  const data = (await res.json()) as RotateResponse;
  if (!res.ok) throw new Error(data.error ?? 'Key rotation failed');
  return data;
}

export async function checkStatus(walletId: string): Promise<StatusResponse> {
  const res = await fetch(`${BACKEND_URL}/v1/admin/status/${walletId}`);
  if (!res.ok) throw new Error('Failed to check status');
  return (await res.json()) as StatusResponse;
}

export async function submitApplication(
  body: ApplyBody
): Promise<ApplyResponse> {
  const res = await fetch(`${BACKEND_URL}/v1/admin/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as ApplyResponse;
  if (!res.ok) throw new Error(data.error ?? 'Application failed');
  return data;
}