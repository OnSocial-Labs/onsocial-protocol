import { ACTIVE_BACKEND_URL, isAdminWallet } from '@/lib/portal-config';

export const ADMIN_PROXY_BACKEND_URL =
  process.env.BACKEND_URL ?? ACTIVE_BACKEND_URL;

export const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';

export { isAdminWallet };
