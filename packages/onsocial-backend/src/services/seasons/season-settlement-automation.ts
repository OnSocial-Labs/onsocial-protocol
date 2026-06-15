import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import {
  confirmFinalizedSettlement,
  finalizeSeasonSettlement,
  getSeasonOnChainConfig,
  getSeasonSettlementSummary,
  previewSeasonSettlement,
  publishSeasonSettlement,
} from './season-finalization.js';
import { fetchSeasonIdsFromChain } from './season-registry-service.js';

const DEFAULT_GRACE_MS = 60 * 60 * 1000;
const DEFAULT_POLL_MS = 15 * 60 * 1000;
const DEFAULT_RETRY_MS = 5 * 60 * 1000;
const DEFAULT_PUBLISH_CONFIRM_MS = 2 * 60 * 60 * 1000;
const TESTNET_PUBLISH_CONFIRM_MS = 15 * 60 * 1000;
const MS_TO_NS = 1_000_000n;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let lastAttemptAt = 0;
const lastFailureMessages = new Map<string, string>();

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function isSeasonAutoFinalizeEnabled(): boolean {
  const raw = process.env.SEASON_AUTO_FINALIZE_ENABLED?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') {
    return false;
  }
  if (raw === '1' || raw === 'true' || raw === 'yes') {
    return true;
  }
  return config.nodeEnv === 'production';
}

export function isSeasonAutoPublishEnabled(): boolean {
  const raw = process.env.SEASON_AUTO_PUBLISH_ENABLED?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') {
    return false;
  }
  if (raw === '1' || raw === 'true' || raw === 'yes') {
    return true;
  }
  return config.nearNetwork === 'testnet' || config.nodeEnv === 'production';
}

export function resolveSeasonAutoFinalizeGraceEndsAtNs(
  endsAtNs: string,
  graceMs = parsePositiveInt(
    process.env.SEASON_AUTO_FINALIZE_GRACE_MS,
    DEFAULT_GRACE_MS
  )
): bigint {
  return BigInt(endsAtNs) + BigInt(graceMs) * MS_TO_NS;
}

function resolvePublishConfirmMs(): number {
  if (process.env.SEASON_AUTO_PUBLISH_CONFIRM_MS?.trim()) {
    return parsePositiveInt(
      process.env.SEASON_AUTO_PUBLISH_CONFIRM_MS,
      DEFAULT_PUBLISH_CONFIRM_MS
    );
  }
  return config.nearNetwork === 'testnet'
    ? TESTNET_PUBLISH_CONFIRM_MS
    : DEFAULT_PUBLISH_CONFIRM_MS;
}

function publishConfirmReady(finalizedAtIso: string): boolean {
  const finalizedAtMs = Date.parse(finalizedAtIso);
  if (!Number.isFinite(finalizedAtMs)) {
    return false;
  }
  return Date.now() >= finalizedAtMs + resolvePublishConfirmMs();
}

function rememberFailure(seasonId: string, message: string): void {
  if (message !== lastFailureMessages.get(seasonId)) {
    lastFailureMessages.set(seasonId, message);
  }
}

function clearFailure(seasonId: string): void {
  lastFailureMessages.delete(seasonId);
}

async function tryAutoFinalize(seasonId: string): Promise<void> {
  const preview = await previewSeasonSettlement(seasonId);
  if (!preview.stable) {
    const message = `Season ${seasonId} standings unstable — auto-finalize skipped`;
    rememberFailure(seasonId, message);
    logger.warn(
      {
        seasonId,
        participantCount: preview.participantCount,
        stabilityDelayMs: preview.stabilityDelayMs,
      },
      message
    );
    return;
  }

  if (BigInt(preview.distributablePoolAmountYocto || '0') <= 0n) {
    const message = `Season ${seasonId} pool is empty — auto-finalize skipped`;
    rememberFailure(seasonId, message);
    logger.warn({ seasonId, preview }, message);
    return;
  }

  const settlement = await finalizeSeasonSettlement(seasonId);
  clearFailure(seasonId);
  logger.info(
    {
      seasonId,
      root: settlement.root,
      totalAmountYocto: settlement.totalAmountYocto,
      participantCount: settlement.participantCount,
      rewardCount: settlement.rewardCount,
    },
    'Season settlement auto-finalized'
  );
}

async function tryAutoPublish(seasonId: string): Promise<void> {
  const settlement = await getSeasonSettlementSummary(seasonId);
  if (!settlement) {
    return;
  }
  if (settlement.status === 'published' && settlement.publishedTxHash) {
    return;
  }
  if (!publishConfirmReady(settlement.createdAt)) {
    return;
  }

  const confirmation = await confirmFinalizedSettlement(seasonId);
  if (!confirmation.confirmed) {
    const message = `Season ${seasonId} publish blocked: ${confirmation.reason ?? 'confirmation failed'}`;
    rememberFailure(seasonId, message);
    logger.error({ seasonId, reason: confirmation.reason }, message);
    return;
  }

  const published = await publishSeasonSettlement(seasonId, { active: true });
  clearFailure(seasonId);
  logger.info(
    {
      seasonId,
      root: published.root,
      totalAmountYocto: published.totalAmountYocto,
      publishedTxHash: published.publishedTxHash,
    },
    'Season settlement auto-published on-chain'
  );
}

async function processSeasonAutomation(
  seasonId: string,
  nowNs: bigint
): Promise<void> {
  const existing = await getSeasonSettlementSummary(seasonId);
  if (existing?.status === 'published' && existing.publishedTxHash) {
    return;
  }

  if (
    existing &&
    existing.status === 'finalized' &&
    isSeasonAutoPublishEnabled()
  ) {
    await tryAutoPublish(seasonId);
    return;
  }

  if (existing) {
    return;
  }

  if (!isSeasonAutoFinalizeEnabled()) {
    return;
  }

  const onChain = await getSeasonOnChainConfig(seasonId);
  if (!onChain?.ends_at_ns) {
    return;
  }

  const graceEndsAtNs = resolveSeasonAutoFinalizeGraceEndsAtNs(
    onChain.ends_at_ns
  );
  if (nowNs < graceEndsAtNs) {
    return;
  }

  await tryAutoFinalize(seasonId);

  if (isSeasonAutoPublishEnabled()) {
    await tryAutoPublish(seasonId);
  }
}

export async function runSeasonAutoFinalizeTick(
  nowNs = BigInt(Date.now()) * MS_TO_NS
): Promise<void> {
  if (inFlight) {
    return;
  }

  inFlight = true;

  try {
    const retryMs = parsePositiveInt(
      process.env.SEASON_AUTO_FINALIZE_RETRY_MS,
      DEFAULT_RETRY_MS
    );
    if (Date.now() - lastAttemptAt < retryMs) {
      return;
    }
    lastAttemptAt = Date.now();

    const seasonIds = await fetchSeasonIdsFromChain();
    if (seasonIds.length === 0) {
      return;
    }

    for (const seasonId of seasonIds) {
      try {
        await processSeasonAutomation(seasonId, nowNs);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        rememberFailure(seasonId, message);
        logger.error({ err: error, seasonId }, message);
      }
    }
  } finally {
    inFlight = false;
  }
}

export function startSeasonAutoFinalizeInBackground(): void {
  if (!isSeasonAutoFinalizeEnabled() && !isSeasonAutoPublishEnabled()) {
    logger.info('Season auto-finalize/publish disabled');
    return;
  }

  const pollMs = parsePositiveInt(
    process.env.SEASON_AUTO_FINALIZE_POLL_MS,
    DEFAULT_POLL_MS
  );
  const graceMs = parsePositiveInt(
    process.env.SEASON_AUTO_FINALIZE_GRACE_MS,
    DEFAULT_GRACE_MS
  );

  logger.info(
    {
      pollMs,
      graceMs,
      autoFinalize: isSeasonAutoFinalizeEnabled(),
      autoPublish: isSeasonAutoPublishEnabled(),
      publishConfirmMs: resolvePublishConfirmMs(),
      nearNetwork: config.nearNetwork,
    },
    'Season settlement automation started'
  );

  void runSeasonAutoFinalizeTick();
  pollTimer = setInterval(() => {
    void runSeasonAutoFinalizeTick();
  }, pollMs);
  pollTimer.unref();
}

export function stopSeasonAutoFinalizeInBackground(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
