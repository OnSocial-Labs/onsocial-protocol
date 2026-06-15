// ---------------------------------------------------------------------------
// OnSocial SDK - SOCIAL spend module
// ---------------------------------------------------------------------------

import { resolveContractId } from '../internal/contracts.js';
import type { BroadcastGetter } from '../internal/session-bridge.js';
import type { HttpClient } from '../internal/http.js';
import type { RelayResponse, WalletBroadcastSigner } from '../types.js';

export type SocialSpendDefaultAction =
  | 'signal_profile'
  | 'boost_post'
  | 'endorse_profile'
  | 'join_rally'
  | 'support_profile';

export type SocialSpendAction = SocialSpendDefaultAction | (string & {});
export type SocialSpendAmount = string | bigint;

export interface SocialSpendInput {
  amount: SocialSpendAmount;
  action: SocialSpendAction;
  targetType: string;
  targetId: string;
  appId?: string;
  seasonId?: string;
  tag?: string;
  recipientId?: string;
  metadata?: unknown;
}

export interface SocialSpendMsg {
  v: 1;
  app_id: string;
  action: string;
  target_type: string;
  target_id: string;
  season_id?: string;
  tag?: string;
  recipient_id?: string;
  metadata?: unknown;
}

export interface SocialSpendFtTransferCallArgs extends Record<string, unknown> {
  receiver_id: string;
  amount: string;
  msg: string;
}

export interface SocialSpendClaimSeasonRewardInput {
  seasonId: string;
  amount: SocialSpendAmount;
  proof: string[];
}

export interface SocialSpendClaimTargetBalanceInput {
  amount?: SocialSpendAmount;
}

export interface SocialSpendSendOptions {
  signer?: WalletBroadcastSigner;
  gas?: string | bigint;
}

type WalletTransaction = Parameters<WalletBroadcastSigner>[0];

const DEFAULT_APP_ID = 'portal';
/** Prepaid cap for token → social-spend → token → boost (+ optional burn). Unused gas is refunded. */
const DEFAULT_SPEND_GAS = '150000000000000';
const DEFAULT_CLAIM_GAS = '100000000000000';
const ONE_YOCTO = '1';
const ZERO_YOCTO = '0';

function normalizePositiveAmount(
  amount: SocialSpendAmount,
  label: string
): string {
  const value = typeof amount === 'bigint' ? amount.toString() : amount;
  if (!/^\d+$/.test(value) || BigInt(value) <= 0n) {
    throw new Error(`${label} must be a positive integer yocto amount`);
  }
  return value;
}

function normalizeGas(
  gas: string | bigint | undefined,
  fallback: string
): string {
  if (gas === undefined) return fallback;
  const value = typeof gas === 'bigint' ? gas.toString() : gas;
  if (!/^\d+$/.test(value) || BigInt(value) <= 0n) {
    throw new Error('gas must be a positive integer yoctoGas amount');
  }
  return value;
}

function optionalString(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

export function buildSocialSpendMsg(input: SocialSpendInput): SocialSpendMsg {
  const msg: SocialSpendMsg = {
    v: 1,
    app_id: optionalString(input.appId) ?? DEFAULT_APP_ID,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
  };
  const seasonId = optionalString(input.seasonId);
  const tag = optionalString(input.tag);
  const recipientId = optionalString(input.recipientId);
  if (seasonId !== undefined) msg.season_id = seasonId;
  if (tag !== undefined) msg.tag = tag;
  if (recipientId !== undefined) msg.recipient_id = recipientId;
  if (input.metadata !== undefined) msg.metadata = input.metadata;
  return msg;
}

export function buildSocialSpendFtTransferCallArgs(
  input: SocialSpendInput,
  socialSpendContractId: string
): SocialSpendFtTransferCallArgs {
  return {
    receiver_id: socialSpendContractId,
    amount: normalizePositiveAmount(input.amount, 'amount'),
    msg: JSON.stringify(buildSocialSpendMsg(input)),
  };
}

export function buildSocialSpendTransaction(
  input: SocialSpendInput,
  opts: {
    tokenContractId: string;
    socialSpendContractId: string;
    gas?: string | bigint;
  }
): WalletTransaction {
  return {
    receiverId: opts.tokenContractId,
    actions: [
      {
        type: 'FunctionCall',
        methodName: 'ft_transfer_call',
        args: buildSocialSpendFtTransferCallArgs(
          input,
          opts.socialSpendContractId
        ),
        gas: normalizeGas(opts.gas, DEFAULT_SPEND_GAS),
        deposit: ONE_YOCTO,
      },
    ],
  };
}

export function buildSocialSpendClaimSeasonRewardTransaction(
  input: SocialSpendClaimSeasonRewardInput,
  opts: { socialSpendContractId: string; gas?: string | bigint }
): WalletTransaction {
  return {
    receiverId: opts.socialSpendContractId,
    actions: [
      {
        type: 'FunctionCall',
        methodName: 'claim_season_reward',
        args: {
          season_id: input.seasonId,
          amount: normalizePositiveAmount(input.amount, 'amount'),
          proof: input.proof,
        },
        gas: normalizeGas(opts.gas, DEFAULT_CLAIM_GAS),
        deposit: ZERO_YOCTO,
      },
    ],
  };
}

export function buildSocialSpendClaimTargetBalanceTransaction(
  input: SocialSpendClaimTargetBalanceInput = {},
  opts: { socialSpendContractId: string; gas?: string | bigint }
): WalletTransaction {
  const args: Record<string, unknown> = {};
  if (input.amount !== undefined) {
    args.amount = normalizePositiveAmount(input.amount, 'amount');
  }
  return {
    receiverId: opts.socialSpendContractId,
    actions: [
      {
        type: 'FunctionCall',
        methodName: 'claim_target_balance',
        args,
        gas: normalizeGas(opts.gas, DEFAULT_CLAIM_GAS),
        deposit: ZERO_YOCTO,
      },
    ],
  };
}

export class SocialSpendSignerRequiredError extends Error {
  readonly code = 'SOCIAL_SPEND_SIGNER_REQUIRED' as const;
  constructor(
    message: string,
    readonly payload: WalletTransaction
  ) {
    super(message);
    this.name = 'SocialSpendSignerRequiredError';
  }
}

export class SocialSpendModule {
  readonly contractId: string;
  readonly tokenContractId: string;

  constructor(
    private readonly _http: HttpClient,
    private readonly _getBroadcast?: BroadcastGetter
  ) {
    this.contractId = resolveContractId(_http.network, 'socialSpend');
    this.tokenContractId = resolveContractId(_http.network, 'token');
  }

  buildSpendTransaction(
    input: SocialSpendInput,
    opts: { gas?: string | bigint } = {}
  ): WalletTransaction {
    return buildSocialSpendTransaction(input, {
      tokenContractId: this.tokenContractId,
      socialSpendContractId: this.contractId,
      gas: opts.gas,
    });
  }

  spend(
    input: SocialSpendInput,
    opts: SocialSpendSendOptions = {}
  ): Promise<RelayResponse> {
    const payload = this.buildSpendTransaction(input, opts);
    return this._sendWithWallet(payload, opts.signer);
  }

  joinRally(
    seasonId: string,
    amount: SocialSpendAmount,
    opts: SocialSpendSendOptions & {
      appId?: string;
      targetId?: string;
      tag?: string;
      metadata?: unknown;
    } = {}
  ): Promise<RelayResponse> {
    return this.spend(
      {
        amount,
        appId: opts.appId,
        action: 'join_rally',
        targetType: 'rally',
        targetId: opts.targetId ?? seasonId,
        seasonId,
        tag: opts.tag,
        metadata: opts.metadata,
      },
      opts
    );
  }

  supportProfile(
    accountId: string,
    amount: SocialSpendAmount,
    opts: SocialSpendSendOptions & {
      appId?: string;
      tag?: string;
      metadata?: unknown;
    } = {}
  ): Promise<RelayResponse> {
    return this.spend(
      {
        amount,
        appId: opts.appId,
        action: 'support_profile',
        targetType: 'profile',
        targetId: accountId,
        tag: opts.tag,
        metadata: opts.metadata,
      },
      opts
    );
  }

  buildClaimSeasonRewardTransaction(
    input: SocialSpendClaimSeasonRewardInput,
    opts: { gas?: string | bigint } = {}
  ): WalletTransaction {
    return buildSocialSpendClaimSeasonRewardTransaction(input, {
      socialSpendContractId: this.contractId,
      gas: opts.gas,
    });
  }

  claimSeasonReward(
    input: SocialSpendClaimSeasonRewardInput,
    opts: SocialSpendSendOptions = {}
  ): Promise<RelayResponse> {
    const payload = this.buildClaimSeasonRewardTransaction(input, opts);
    return this._sendWithWallet(payload, opts.signer);
  }

  buildClaimTargetBalanceTransaction(
    input: SocialSpendClaimTargetBalanceInput = {},
    opts: { gas?: string | bigint } = {}
  ): WalletTransaction {
    return buildSocialSpendClaimTargetBalanceTransaction(input, {
      socialSpendContractId: this.contractId,
      gas: opts.gas,
    });
  }

  claimTargetBalance(
    input: SocialSpendClaimTargetBalanceInput = {},
    opts: SocialSpendSendOptions = {}
  ): Promise<RelayResponse> {
    const payload = this.buildClaimTargetBalanceTransaction(input, opts);
    return this._sendWithWallet(payload, opts.signer);
  }

  private async _sendWithWallet(
    payload: WalletTransaction,
    signer?: WalletBroadcastSigner
  ): Promise<RelayResponse> {
    const walletSigner = signer ?? this._defaultWalletSigner();
    if (!walletSigner) {
      throw new SocialSpendSignerRequiredError(
        'os.socialSpend requires a wallet signer because SOCIAL spends and claims are direct contract calls.',
        payload
      );
    }
    return walletSigner(payload);
  }

  private _defaultWalletSigner(): WalletBroadcastSigner | undefined {
    const broadcast = this._getBroadcast?.();
    return typeof broadcast === 'object' && broadcast.kind === 'wallet'
      ? broadcast.signer
      : undefined;
  }
}
