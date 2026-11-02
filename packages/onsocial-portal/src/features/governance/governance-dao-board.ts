'use client';

import { governanceDaoAccount, treasuryDaoAccount } from '@/lib/portal-config';
import { usePortalNetwork } from '@/contexts/portal-network-context';
import type { PortalNearNetwork } from '@/lib/portal-network';
import type { GovernanceLane } from '@/features/governance/page-utils';
import { LANE_OPTIONS } from '@/features/governance/page-utils';
import { useSearchParams } from 'next/navigation';

export type GovernanceDaoBoard = 'governance' | 'treasury';

export const GOVERNANCE_DAO_BOARD_PARAM = 'dao';

export function governanceDaoBoardOptions(network: PortalNearNetwork): Array<{
  value: GovernanceDaoBoard;
  label: string;
  accountId: string;
}> {
  return [
    {
      value: 'governance',
      label: 'Governance',
      accountId: governanceDaoAccount(network),
    },
    {
      value: 'treasury',
      label: 'Treasury',
      accountId: treasuryDaoAccount(network),
    },
  ];
}

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
  board: GovernanceDaoBoard = 'governance',
  network?: PortalNearNetwork
): string {
  return board === 'treasury'
    ? treasuryDaoAccount(network)
    : governanceDaoAccount(network);
}

export function resolveGovernanceDaoBoard(
  daoAccountId: string | null | undefined,
  network?: PortalNearNetwork
): GovernanceDaoBoard {
  if (daoAccountId === treasuryDaoAccount(network)) {
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
  governanceLive: boolean;
} {
  const searchParams = useSearchParams();
  const { network, live } = usePortalNetwork();
  const board = parseGovernanceDaoBoard(
    searchParams.get(GOVERNANCE_DAO_BOARD_PARAM)
  );

  return {
    board,
    daoAccountId: resolveGovernanceDaoAccountId(board, network),
    laneOptions: getLaneOptionsForBoard(board),
    governanceLive: live.governance,
  };
}
