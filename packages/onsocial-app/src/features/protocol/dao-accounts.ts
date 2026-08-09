import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import type { ProtocolDaoBoard } from '@/lib/app-routes';

export const PROTOCOL_DAO_BOARD_OPTIONS: Array<{
  value: ProtocolDaoBoard;
  label: string;
  accountId: string;
}> = [
  {
    value: 'governance',
    label: 'Governance',
    accountId: GOVERNANCE_DAO_ACCOUNT,
  },
  {
    value: 'treasury',
    label: 'Treasury',
    accountId: TREASURY_DAO_ACCOUNT,
  },
];

export function resolveProtocolDaoAccountId(
  board: ProtocolDaoBoard = 'governance'
): string {
  return board === 'treasury' ? TREASURY_DAO_ACCOUNT : GOVERNANCE_DAO_ACCOUNT;
}

export function resolveProtocolDaoBoard(
  daoAccountId: string | null | undefined
): ProtocolDaoBoard {
  return daoAccountId === TREASURY_DAO_ACCOUNT ? 'treasury' : 'governance';
}
