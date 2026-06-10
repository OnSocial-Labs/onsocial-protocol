'use client';

import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/portal-config';
import type { GovernanceLane } from '@/features/governance/page-utils';
import { LANE_OPTIONS } from '@/features/governance/page-utils';
import { useSearchParams } from 'next/navigation';

export type GovernanceDaoBoard = 'governance' | 'treasury';

export const GOVERNANCE_DAO_BOARD_PARAM = 'dao';

export const GOVERNANCE_DAO_BOARD_OPTIONS: Array<{
  value: GovernanceDaoBoard;
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

const TREASURY_LANE_OPTIONS: Array<{ value: GovernanceLane; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'protocol', label: 'Treasury' },
];

export function parseGovernanceDaoBoard(
  value: string | null | undefined
): GovernanceDaoBoard {
  return value === 'treasury' ? 'treasury' : 'governance';
}

export function resolveGovernanceDaoAccountId(
  board: GovernanceDaoBoard = 'governance'
): string {
  return board === 'treasury' ? TREASURY_DAO_ACCOUNT : GOVERNANCE_DAO_ACCOUNT;
}

export function resolveGovernanceDaoBoard(
  daoAccountId: string | null | undefined
): GovernanceDaoBoard {
  if (daoAccountId === TREASURY_DAO_ACCOUNT) {
    return 'treasury';
  }

  return 'governance';
}

export function getLaneOptionsForBoard(
  board: GovernanceDaoBoard
): Array<{ value: GovernanceLane; label: string }> {
  return board === 'treasury' ? TREASURY_LANE_OPTIONS : LANE_OPTIONS;
}

export function normalizeLaneForBoard(
  board: GovernanceDaoBoard,
  lane: GovernanceLane
): GovernanceLane {
  if (board === 'treasury' && lane === 'partners') {
    return 'all';
  }

  return lane;
}

export function appendGovernanceDaoBoardParam(
  params: URLSearchParams,
  board: GovernanceDaoBoard
): URLSearchParams {
  if (board === 'treasury') {
    params.set(GOVERNANCE_DAO_BOARD_PARAM, 'treasury');
  } else {
    params.delete(GOVERNANCE_DAO_BOARD_PARAM);
  }

  return params;
}

export function buildGovernancePathWithBoard(
  path: string,
  board: GovernanceDaoBoard,
  extraParams?: Record<string, string | null | undefined>
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(extraParams ?? {})) {
    if (value?.trim()) {
      params.set(key, value.trim());
    }
  }

  appendGovernanceDaoBoardParam(params, board);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function useGovernanceDaoBoardFromUrl(): {
  board: GovernanceDaoBoard;
  daoAccountId: string;
  laneOptions: Array<{ value: GovernanceLane; label: string }>;
} {
  const searchParams = useSearchParams();
  const board = parseGovernanceDaoBoard(
    searchParams.get(GOVERNANCE_DAO_BOARD_PARAM)
  );

  return {
    board,
    daoAccountId: resolveGovernanceDaoAccountId(board),
    laneOptions: getLaneOptionsForBoard(board),
  };
}
