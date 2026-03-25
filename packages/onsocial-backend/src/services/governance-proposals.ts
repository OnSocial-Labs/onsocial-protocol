import { config } from '../config/index.js';

const SOCIAL_DECIMALS = 18;
const DEFAULT_FUNCTION_CALL_GAS = '250000000000000';

export const DEFAULT_PARTNER_GOVERNANCE_PARAMS: GovernanceContractParams = {
  rewardPerAction: '0.1',
  dailyCap: '1',
  totalBudget: '100000',
  dailyBudget: '1000',
};

export const PARTNER_AUDIENCE_BANDS = [
  '<1k',
  '1k-10k',
  '10k-50k',
  '50k+',
] as const;

export type PartnerAudienceBand = (typeof PARTNER_AUDIENCE_BANDS)[number];

export const PARTNER_AUDIENCE_BAND_BUDGETS: Record<
  PartnerAudienceBand,
  Pick<GovernanceContractParams, 'dailyBudget' | 'totalBudget'>
> = {
  '<1k': {
    dailyBudget: '500',
    totalBudget: '50000',
  },
  '1k-10k': {
    dailyBudget: '2500',
    totalBudget: '250000',
  },
  '10k-50k': {
    dailyBudget: '7500',
    totalBudget: '750000',
  },
  '50k+': {
    dailyBudget: '15000',
    totalBudget: '1500000',
  },
};

export interface GovernanceContractParams {
  rewardPerAction: string;
  dailyCap: string;
  totalBudget: string;
  dailyBudget: string;
}

export interface GovernanceAppMetadata {
  walletId?: string;
  description?: string;
  audienceBand?: PartnerAudienceBand;
  websiteUrl?: string;
  telegramHandle?: string;
  xHandle?: string;
}

export interface GovernanceProposalAction {
  method_name: string;
  args: string;
  deposit: string;
  gas: number;
}

export interface GovernanceProposalPayload {
  proposal: {
    description: string;
    kind: {
      FunctionCall: {
        receiver_id: string;
        actions: GovernanceProposalAction[];
      };
    };
  };
}

export interface GovernanceProposalMetadata {
  proposal_id: number | null;
  status: 'draft' | 'submitted';
  description: string;
  dao_account: string;
  tx_hash: string | null;
  submitted_at: string | null;
}

export interface GovernanceProposalDraft {
  metadata: GovernanceProposalMetadata;
  payload: GovernanceProposalPayload;
}

interface RegisterAppProposalInput {
  appId: string;
  label: string;
  params: GovernanceContractParams;
  metadata?: GovernanceAppMetadata;
}

export function getPartnerGovernanceParamsForAudienceBand(
  audienceBand: PartnerAudienceBand
): GovernanceContractParams {
  return {
    rewardPerAction: DEFAULT_PARTNER_GOVERNANCE_PARAMS.rewardPerAction,
    dailyCap: DEFAULT_PARTNER_GOVERNANCE_PARAMS.dailyCap,
    totalBudget: PARTNER_AUDIENCE_BAND_BUDGETS[audienceBand].totalBudget,
    dailyBudget: PARTNER_AUDIENCE_BAND_BUDGETS[audienceBand].dailyBudget,
  };
}

function parseAmount(raw: string, field: string): string {
  const value = raw.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(value)) {
    throw new Error(`${field} must be a positive decimal with up to 18 places`);
  }
  return value;
}

function socialToYocto(raw: string): string {
  const value = raw.trim();
  if (!value || value === '0') return '0';

  const [wholePart, fractionPart = ''] = value.split('.');
  const normalizedWhole = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fractionPart
    .padEnd(SOCIAL_DECIMALS, '0')
    .slice(0, SOCIAL_DECIMALS);

  return `${normalizedWhole}${normalizedFraction}`.replace(/^0+/, '') || '0';
}

function toActionArgsBase64(args: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(args), 'utf8').toString('base64');
}

export function validateGovernanceParams(
  params: GovernanceContractParams
): GovernanceContractParams {
  const rewardPerAction = parseAmount(
    params.rewardPerAction,
    'rewardPerAction'
  );
  const dailyCap = parseAmount(params.dailyCap, 'dailyCap');
  const totalBudget = parseAmount(params.totalBudget, 'totalBudget');
  const dailyBudget = parseAmount(params.dailyBudget, 'dailyBudget');

  if (parseFloat(rewardPerAction) <= 0) {
    throw new Error('rewardPerAction must be greater than 0');
  }
  if (parseFloat(dailyCap) <= 0) {
    throw new Error('dailyCap must be greater than 0');
  }
  if (parseFloat(totalBudget) <= 0) {
    throw new Error('totalBudget must be greater than 0');
  }
  if (parseFloat(dailyBudget) < 0) {
    throw new Error('dailyBudget must be greater than or equal to 0');
  }
  if (parseFloat(rewardPerAction) > 1) {
    throw new Error('rewardPerAction must be less than or equal to 1 SOCIAL');
  }
  if (parseFloat(dailyCap) > 10) {
    throw new Error('dailyCap must be less than or equal to 10 SOCIAL');
  }
  if (parseFloat(rewardPerAction) > parseFloat(dailyCap)) {
    throw new Error(
      'dailyCap must be greater than or equal to rewardPerAction'
    );
  }

  return {
    rewardPerAction,
    dailyCap,
    totalBudget,
    dailyBudget,
  };
}

export function buildRegisterAppGovernanceProposal({
  appId,
  label,
  params,
  metadata,
}: RegisterAppProposalInput): GovernanceProposalDraft {
  const validated = validateGovernanceParams(params);
  const registerArgs = {
    config: {
      app_id: appId,
      label,
      daily_cap: socialToYocto(validated.dailyCap),
      reward_per_action: socialToYocto(validated.rewardPerAction),
      authorized_callers: [config.relayerAccount],
      total_budget: socialToYocto(validated.totalBudget),
      daily_budget: socialToYocto(validated.dailyBudget),
    },
  };

  const descriptionLines = [
    `Register community app ${label} (${appId}) on ${config.rewardsContract}.`,
    metadata?.walletId ? `Applicant wallet: ${metadata.walletId}` : null,
    metadata?.audienceBand ? `Audience band: ${metadata.audienceBand}` : null,
    metadata?.websiteUrl ? `Website: ${metadata.websiteUrl}` : null,
    metadata?.telegramHandle ? `Telegram: ${metadata.telegramHandle}` : null,
    metadata?.xHandle ? `X: ${metadata.xHandle}` : null,
    metadata?.description ? `Description: ${metadata.description}` : null,
    `Reward per action: ${validated.rewardPerAction} SOCIAL`,
    `Daily cap: ${validated.dailyCap} SOCIAL`,
    `Total budget: ${validated.totalBudget} SOCIAL`,
    `Daily budget: ${validated.dailyBudget} SOCIAL`,
  ].filter((line): line is string => Boolean(line));

  const description = descriptionLines.join('\n');
  const payload: GovernanceProposalPayload = {
    proposal: {
      description,
      kind: {
        FunctionCall: {
          receiver_id: config.rewardsContract,
          actions: [
            {
              method_name: 'register_app',
              args: toActionArgsBase64(registerArgs),
              deposit: '0',
              gas: Number(DEFAULT_FUNCTION_CALL_GAS),
            },
          ],
        },
      },
    },
  };

  return {
    metadata: {
      proposal_id: null,
      status: 'draft',
      description,
      dao_account: config.governanceDao,
      tx_hash: null,
      submitted_at: null,
    },
    payload,
  };
}

export async function isRewardsAppRegistered(appId: string): Promise<boolean> {
  const response = await fetch(config.nearRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'onsocial-governance-activation',
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: config.rewardsContract,
        method_name: 'get_app_config',
        args_base64: Buffer.from(
          JSON.stringify({ app_id: appId }),
          'utf8'
        ).toString('base64'),
      },
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to query rewards contract');
  }

  const body = (await response.json()) as {
    result?: { result?: number[] };
    error?: { message?: string };
  };

  if (body.error) {
    return false;
  }

  const bytes = body.result?.result;
  if (!bytes || bytes.length === 0) {
    return false;
  }

  const decoded = Buffer.from(bytes).toString('utf8').trim();
  if (!decoded || decoded === 'null') {
    return false;
  }

  try {
    const parsed = JSON.parse(decoded) as Record<string, unknown> | null;
    return parsed !== null;
  } catch {
    return false;
  }
}
