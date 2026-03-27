// ---------------------------------------------------------------------------
// Partner application routes
// ---------------------------------------------------------------------------
//
// Public (wallet-authenticated via portal):
//   POST /v1/partners/apply              — submit a partner application
//   GET  /v1/partners/governance-feed    — list public governance applications
//   GET  /v1/partners/status/:wallet     — check application status by wallet
//   POST /v1/partners/cancel/:appId      — return a governance-ready app to form state
//   POST /v1/partners/proposal-submitted/:appId — record direct DAO submission
//   POST /v1/partners/rotate-key/:wallet — rotate API key
// ---------------------------------------------------------------------------

import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import { query } from '../db/index.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { viewContractAt } from '../services/near.js';
import {
  buildRegisterAppGovernanceProposal,
  getPartnerGovernanceParamsForAudienceBand,
  isRewardsAppRegistered,
  PARTNER_AUDIENCE_BANDS,
  type PartnerAudienceBand,
  type GovernanceProposalDraft,
  type GovernanceProposalPayload,
} from '../services/governance-proposals.js';
import {
  buildPartnerKeyClaimChallenge,
  verifyPartnerKeyClaim,
} from '../services/partner-key-claim.js';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function generateApiKey(): string {
  return `os_live_${randomBytes(32).toString('hex')}`;
}

function parseGovernancePayload(
  value: GovernanceProposalPayload | string | null | undefined
): GovernanceProposalPayload | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return JSON.parse(value) as GovernanceProposalPayload;
  }

  return value;
}

function mapGovernanceProposal(
  row: Record<string, unknown>,
  includePayload = false
) {
  if (!row.governance_proposal_status) {
    return null;
  }

  const payload = parseGovernancePayload(
    row.governance_proposal_payload as
      | GovernanceProposalPayload
      | string
      | null
      | undefined
  );

  return {
    proposal_id:
      typeof row.governance_proposal_id === 'number'
        ? row.governance_proposal_id
        : row.governance_proposal_id === null ||
            row.governance_proposal_id === undefined
          ? null
          : Number(row.governance_proposal_id),
    status: row.governance_proposal_status,
    description: row.governance_proposal_description,
    dao_account: row.governance_proposal_dao,
    tx_hash: row.governance_proposal_tx_hash,
    submitted_at: row.governance_proposal_submitted_at,
    ...(includePayload ? { payload } : {}),
  };
}

function mapPublicApplication(row: Record<string, unknown>) {
  return {
    app_id: row.app_id,
    label: row.label,
    status: row.status,
    wallet_id: row.wallet_id,
    description: row.description,
    website_url: row.website_url,
    telegram_handle: row.telegram_handle,
    x_handle: row.x_handle,
    created_at: row.created_at,
    governance_proposal: mapGovernanceProposal(row, true),
  };
}

function parseAudienceBandFromGovernanceDescription(
  value: unknown
): PartnerAudienceBand | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }

  const match = value.match(/^Audience band: (.+)$/m);
  if (!match) {
    return null;
  }

  const audienceBand = match[1]?.trim();
  return PARTNER_AUDIENCE_BANDS.includes(audienceBand as PartnerAudienceBand)
    ? (audienceBand as PartnerAudienceBand)
    : null;
}

function mapApplicationForm(row: Record<string, unknown>) {
  return {
    appId: typeof row.app_id === 'string' ? row.app_id : '',
    label: typeof row.label === 'string' ? row.label : '',
    description: typeof row.description === 'string' ? row.description : '',
    audienceBand:
      parseAudienceBandFromGovernanceDescription(
        row.governance_proposal_description
      ) ?? '1k-10k',
    websiteUrl: typeof row.website_url === 'string' ? row.website_url : '',
    telegramHandle:
      typeof row.telegram_handle === 'string' ? row.telegram_handle : '',
    xHandle: typeof row.x_handle === 'string' ? row.x_handle : '',
  };
}

const REJECTED_GOVERNANCE_STATUSES = new Set(['Rejected', 'Removed']);
const REOPENED_GOVERNANCE_STATUSES = new Set(['Expired']);

function normalizeProposalId(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    return null;
  }

  return numericValue;
}

async function fetchDaoProposalStatus(
  daoAccountId: string,
  proposalId: number
): Promise<string | null> {
  try {
    const proposal = await viewContractAt<{ status?: string }>(
      daoAccountId,
      'get_proposal',
      { id: proposalId }
    );

    return typeof proposal?.status === 'string' ? proposal.status : null;
  } catch {
    return null;
  }
}
// ---------------------------------------------------------------------------
// POST /v1/partners/apply — partner submits application (creates pending entry)
// ---------------------------------------------------------------------------

interface ApplyBody {
  app_id?: string;
  label: string;
  description?: string;
  audience_band?: string;
  wallet_id?: string;
  website_url?: string;
  telegram_handle?: string;
  x_handle?: string;
}

const MIN_PARTNER_DESCRIPTION_LEN = 20;
const MAX_PARTNER_DESCRIPTION_LEN = 280;
const MAX_WEBSITE_URL_LEN = 255;
const PROJECT_NAME_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9 &.,'()/-]{0,98}[A-Za-z0-9])?$/;
const DESCRIPTION_ALLOWED_PATTERN = /^[A-Za-z0-9 .,'"!?:;()&/\-\n]+$/;

function hasPublicWebsiteHostname(hostname: string) {
  if (!hostname || hostname.startsWith('.') || hostname.endsWith('.')) {
    return false;
  }

  const labels = hostname.split('.');
  return labels.length >= 2 && labels.every((label) => label.length > 0);
}

function normalizeOptionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProjectName(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

function normalizeDescription(raw: unknown): string {
  return typeof raw === 'string'
    ? raw
        .replace(/\r\n?/g, '\n')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : '';
}

function sanitizeWebsiteUrl(raw: unknown): string {
  const value = normalizeOptionalText(raw);
  if (!value) {
    return '';
  }

  try {
    const withProtocol = /^[a-z]+:\/\//i.test(value)
      ? value
      : `https://${value}`;

    if (withProtocol.length > MAX_WEBSITE_URL_LEN) {
      throw new Error(
        `website_url must be ${MAX_WEBSITE_URL_LEN} characters or fewer`
      );
    }

    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Website URL must use http or https');
    }

    if (!hasPublicWebsiteHostname(url.hostname.toLowerCase())) {
      throw new Error('website_url must include a domain like example.com');
    }

    if (url.toString().length > MAX_WEBSITE_URL_LEN) {
      throw new Error(
        `website_url must be ${MAX_WEBSITE_URL_LEN} characters or fewer`
      );
    }

    return url.toString();
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('website_url must be') ||
        err.message.includes('website_url must include'))
    ) {
      throw err;
    }

    throw new Error('website_url must be a valid http or https URL');
  }
}

function sanitizeHandle(
  raw: unknown,
  field: 'telegram_handle' | 'x_handle'
): string {
  const value = normalizeOptionalText(raw);
  if (!value) {
    return '';
  }

  let candidate = value;

  if (/^https?:\/\//i.test(value) || value.includes('/')) {
    const withProtocol = /^https?:\/\//i.test(value)
      ? value
      : `https://${value}`;

    try {
      const url = new URL(withProtocol);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
      const allowedHosts =
        field === 'telegram_handle'
          ? ['t.me', 'telegram.me']
          : ['x.com', 'twitter.com'];

      if (!allowedHosts.includes(hostname)) {
        throw new Error();
      }

      const [handle, ...rest] = url.pathname.split('/').filter(Boolean);
      if (!handle || rest.length > 0) {
        throw new Error();
      }

      candidate = handle;
    } catch {
      throw new Error(
        field === 'telegram_handle'
          ? 'telegram_handle must be a valid username or t.me link'
          : 'x_handle must be a valid handle or x.com link'
      );
    }
  }

  candidate = candidate.replace(/^@/, '');

  const pattern =
    field === 'telegram_handle'
      ? /^[A-Za-z0-9_]{5,32}$/
      : /^[A-Za-z0-9_]{1,15}$/;

  if (!pattern.test(candidate)) {
    throw new Error(
      field === 'telegram_handle'
        ? 'telegram_handle must be a valid username or t.me link'
        : 'x_handle must be a valid handle or x.com link'
    );
  }

  return `@${candidate}`;
}

async function syncGovernanceProposalState(row: {
  app_id: string;
  status: string;
  api_key?: string | null;
  governance_proposal_id?: number | string | null;
  governance_proposal_status?: string | null;
  governance_proposal_dao?: string | null;
}): Promise<typeof row> {
  if (row.status !== 'proposal_submitted') {
    return row;
  }

  const proposalId = normalizeProposalId(row.governance_proposal_id);
  const daoAccountId = row.governance_proposal_dao ?? config.governanceDao;

  if (proposalId !== null) {
    const liveProposalStatus = await fetchDaoProposalStatus(
      daoAccountId,
      proposalId
    );

    if (
      liveProposalStatus &&
      REJECTED_GOVERNANCE_STATUSES.has(liveProposalStatus)
    ) {
      const normalizedStatus = liveProposalStatus.toLowerCase();

      await query(
        `UPDATE partner_keys
         SET status = 'rejected',
             active = false,
             governance_proposal_status = $1
         WHERE app_id = $2`,
        [normalizedStatus, row.app_id]
      );

      return {
        ...row,
        status: 'rejected',
        governance_proposal_status: normalizedStatus,
      };
    }

    if (
      liveProposalStatus &&
      REOPENED_GOVERNANCE_STATUSES.has(liveProposalStatus)
    ) {
      const normalizedStatus = liveProposalStatus.toLowerCase();

      await query(
        `UPDATE partner_keys
         SET status = 'reopened',
             active = false,
             governance_proposal_status = $1
         WHERE app_id = $2`,
        [normalizedStatus, row.app_id]
      );

      return {
        ...row,
        status: 'reopened',
        governance_proposal_status: normalizedStatus,
      };
    }
  }

  const isRegistered = await isRewardsAppRegistered(row.app_id);
  if (!isRegistered) {
    return row;
  }

  const apiKey = row.api_key ?? generateApiKey();

  await query(
    `UPDATE partner_keys
     SET status = 'approved',
         api_key = $1,
         active = true,
         governance_proposal_status = 'executed'
     WHERE app_id = $2`,
    [apiKey, row.app_id]
  );

  return {
    ...row,
    status: 'approved',
    api_key: apiKey,
    governance_proposal_status: 'executed',
  };
}

router.post('/apply', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as ApplyBody;

  if (!body.label || typeof body.label !== 'string' || !body.label.trim()) {
    res.status(400).json({ success: false, error: 'label is required' });
    return;
  }
  const label = normalizeProjectName(body.label);

  const app_id =
    body.app_id && typeof body.app_id === 'string' && body.app_id.trim()
      ? body.app_id.trim()
      : toSlug(label);

  if (!app_id || !/^[a-z0-9_]{3,64}$/.test(app_id)) {
    res.status(400).json({
      success: false,
      error:
        'app_id must be 3-64 characters, lowercase letters, numbers, and underscores only',
    });
    return;
  }

  if (label.length < 2 || label.length > 100) {
    res
      .status(400)
      .json({ success: false, error: 'label must be 2-100 characters' });
    return;
  }

  if (!PROJECT_NAME_PATTERN.test(label)) {
    res.status(400).json({
      success: false,
      error:
        'label must use letters, numbers, spaces, and simple punctuation only',
    });
    return;
  }

  const description = normalizeDescription(body.description);
  if (
    description.length < MIN_PARTNER_DESCRIPTION_LEN ||
    description.length > MAX_PARTNER_DESCRIPTION_LEN
  ) {
    res.status(400).json({
      success: false,
      error: `description must be ${MIN_PARTNER_DESCRIPTION_LEN}-${MAX_PARTNER_DESCRIPTION_LEN} characters`,
    });
    return;
  }

  if (!DESCRIPTION_ALLOWED_PATTERN.test(description)) {
    res.status(400).json({
      success: false,
      error:
        'description must use letters, numbers, spaces, and basic punctuation only',
    });
    return;
  }

  try {
    let websiteUrl: string;
    let telegramHandle: string;
    let xHandle: string;

    try {
      websiteUrl = sanitizeWebsiteUrl(body.website_url);
      telegramHandle = sanitizeHandle(body.telegram_handle, 'telegram_handle');
      xHandle = sanitizeHandle(body.x_handle, 'x_handle');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: msg });
      return;
    }

    if (!websiteUrl && !telegramHandle && !xHandle) {
      res.status(400).json({
        success: false,
        error:
          'At least one of website_url, telegram_handle, or x_handle is required',
      });
      return;
    }

    const audienceBand = body.audience_band;
    if (
      !audienceBand ||
      !PARTNER_AUDIENCE_BANDS.includes(audienceBand as PartnerAudienceBand)
    ) {
      res.status(400).json({
        success: false,
        error: 'audience_band must be one of <1k, 1k-10k, 10k-50k, 50k+',
      });
      return;
    }

    const normalizedAudienceBand = audienceBand as PartnerAudienceBand;

    let proposalDraft: GovernanceProposalDraft;

    try {
      proposalDraft = buildRegisterAppGovernanceProposal({
        appId: app_id,
        label,
        params: getPartnerGovernanceParamsForAudienceBand(
          normalizedAudienceBand
        ),
        metadata: {
          walletId: body.wallet_id || undefined,
          description,
          audienceBand: normalizedAudienceBand,
          websiteUrl,
          telegramHandle,
          xHandle,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: msg });
      return;
    }

    const nextStatus = 'ready_for_governance';

    // Check if app_id already exists
    const existing = await query(
      `SELECT id, status, wallet_id FROM partner_keys WHERE app_id = $1`,
      [app_id]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0] as {
        status: string;
        wallet_id: string | null;
      };

      if (
        row.status === 'reopened' &&
        row.wallet_id === (body.wallet_id || null)
      ) {
        await query(
          `UPDATE partner_keys
           SET label = $1,
               status = $2,
               wallet_id = $3,
               description = $4,
               expected_users = '',
               contact = '',
               website_url = $5,
               telegram_handle = $6,
               x_handle = $7,
               active = false,
               api_key = NULL,
               admin_notes = '',
               reviewed_at = NULL,
               governance_proposal_id = $8,
               governance_proposal_status = $9,
               governance_proposal_description = $10,
               governance_proposal_dao = $11,
               governance_proposal_payload = $12::jsonb,
               governance_proposal_tx_hash = $13,
               governance_proposal_submitted_at = $14,
               created_at = now()
           WHERE app_id = $15`,
          [
            label,
            nextStatus,
            body.wallet_id || null,
            description,
            websiteUrl,
            telegramHandle,
            xHandle,
            proposalDraft?.metadata.proposal_id ?? null,
            proposalDraft?.metadata.status ?? null,
            proposalDraft?.metadata.description ?? null,
            proposalDraft?.metadata.dao_account ?? null,
            proposalDraft ? JSON.stringify(proposalDraft.payload) : null,
            proposalDraft?.metadata.tx_hash ?? null,
            proposalDraft?.metadata.submitted_at ?? null,
            app_id,
          ]
        );

        logger.info(
          { appId: app_id, label, wallet: body.wallet_id },
          'Partner application resubmitted'
        );

        res.json({
          success: true,
          app_id,
          label,
          status: nextStatus,
          governance_proposal: proposalDraft
            ? {
                ...proposalDraft.metadata,
                payload: proposalDraft.payload,
              }
            : null,
        });
        return;
      }

      res.status(409).json({
        success: false,
        error: `app_id already ${row.status}`,
        status: row.status,
      });
      return;
    }

    // Insert application row and optionally persist a direct-governance draft.
    await query(
      `INSERT INTO partner_keys (
         api_key,
         app_id,
         label,
         status,
         wallet_id,
         description,
         expected_users,
         contact,
         website_url,
         telegram_handle,
         x_handle,
         active,
         governance_proposal_id,
         governance_proposal_status,
         governance_proposal_description,
         governance_proposal_dao,
         governance_proposal_payload,
         governance_proposal_tx_hash,
         governance_proposal_submitted_at
       ) VALUES (
         NULL,
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10,
         false,
         $11,
         $12,
         $13,
         $14,
         $15::jsonb,
         $16,
         $17
       )`,
      [
        app_id,
        label,
        nextStatus,
        body.wallet_id || null,
        description,
        '',
        '',
        websiteUrl,
        telegramHandle,
        xHandle,
        proposalDraft?.metadata.proposal_id ?? null,
        proposalDraft?.metadata.status ?? null,
        proposalDraft?.metadata.description ?? null,
        proposalDraft?.metadata.dao_account ?? null,
        proposalDraft ? JSON.stringify(proposalDraft.payload) : null,
        proposalDraft?.metadata.tx_hash ?? null,
        proposalDraft?.metadata.submitted_at ?? null,
      ]
    );

    logger.info(
      { appId: app_id, label, wallet: body.wallet_id },
      'Partner application submitted'
    );

    res.json({
      success: true,
      app_id,
      label,
      status: nextStatus,
      governance_proposal: {
        ...proposalDraft.metadata,
        payload: proposalDraft.payload,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ appId: app_id, error: msg }, 'Partner application failed');
    res.status(500).json({ success: false, error: 'Application failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /v1/partners/status/:wallet — check application status by wallet address
// ---------------------------------------------------------------------------

router.get(
  '/governance-feed',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await query(
        `SELECT app_id,
                label,
                status,
                wallet_id,
                description,
                website_url,
                telegram_handle,
                x_handle,
                created_at,
                governance_proposal_id,
                governance_proposal_status,
                governance_proposal_description,
                governance_proposal_dao,
                governance_proposal_payload,
                governance_proposal_tx_hash,
                governance_proposal_submitted_at
         FROM partner_keys
        WHERE status IN ('ready_for_governance', 'proposal_submitted', 'approved', 'rejected')
          OR (status = 'reopened' AND governance_proposal_status IS NOT NULL)
         ORDER BY created_at DESC`
      );

      const syncedRows = await Promise.all(
        result.rows.map((row) =>
          syncGovernanceProposalState(
            row as {
              app_id: string;
              status: string;
              api_key?: string | null;
              governance_proposal_id?: number | string | null;
              governance_proposal_status?: string | null;
              governance_proposal_dao?: string | null;
            }
          )
        )
      );

      res.json({
        success: true,
        applications: syncedRows.map((row) => mapPublicApplication(row)),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/partners/status/:wallet — check application status by wallet address
// ---------------------------------------------------------------------------

router.get(
  '/status/:wallet',
  async (req: Request, res: Response): Promise<void> => {
    const { wallet } = req.params;

    try {
      const result = await query(
        `SELECT app_id,
                label,
                status,
                api_key,
                created_at,
          website_url,
          telegram_handle,
          x_handle,
                governance_proposal_id,
                governance_proposal_status,
                governance_proposal_description,
                governance_proposal_dao,
                governance_proposal_payload,
                governance_proposal_tx_hash,
                governance_proposal_submitted_at
         FROM partner_keys
         WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [wallet]
      );

      if (result.rows.length === 0) {
        res.json({ success: true, status: 'none' });
        return;
      }

      const row = result.rows[0] as {
        app_id: string;
        label: string;
        status: string;
        api_key: string | null;
        created_at: string;
        website_url: string;
        telegram_handle: string;
        x_handle: string;
        governance_proposal_id: number | string | null;
        governance_proposal_status: string | null;
        governance_proposal_description: string | null;
        governance_proposal_dao: string | null;
        governance_proposal_payload: GovernanceProposalPayload | string | null;
        governance_proposal_tx_hash: string | null;
        governance_proposal_submitted_at: string | null;
      };

      const syncedRow = await syncGovernanceProposalState(row);

      res.json({
        success: true,
        app_id: syncedRow.app_id,
        label: row.label,
        status: syncedRow.status === 'reopened' ? 'none' : syncedRow.status,
        applied_at: row.created_at,
        governance_proposal: mapGovernanceProposal(syncedRow, true),
        application_form: mapApplicationForm(row),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

router.post(
  '/cancel/:appId',
  async (req: Request, res: Response): Promise<void> => {
    const { appId } = req.params;
    const { wallet_id } = (req.body ?? {}) as {
      wallet_id?: string;
    };

    if (!wallet_id || typeof wallet_id !== 'string') {
      res.status(400).json({ success: false, error: 'wallet_id is required' });
      return;
    }

    try {
      const existing = await query(
        `SELECT status, wallet_id
         FROM partner_keys
         WHERE app_id = $1`,
        [appId]
      );

      if (existing.rows.length === 0) {
        res
          .status(404)
          .json({ success: false, error: 'Application not found' });
        return;
      }

      const row = existing.rows[0] as {
        status: string;
        wallet_id: string | null;
      };

      if (row.wallet_id !== wallet_id) {
        res.status(403).json({ success: false, error: 'Wallet mismatch' });
        return;
      }

      if (row.status !== 'ready_for_governance') {
        res.status(409).json({
          success: false,
          error:
            'Only governance-ready applications can be returned to the form',
        });
        return;
      }

      await query(
        `UPDATE partner_keys
         SET status = 'reopened',
             active = false,
             governance_proposal_id = NULL,
             governance_proposal_status = NULL,
             governance_proposal_description = NULL,
             governance_proposal_dao = NULL,
             governance_proposal_payload = NULL,
             governance_proposal_tx_hash = NULL,
             governance_proposal_submitted_at = NULL
         WHERE app_id = $1`,
        [appId]
      );

      res.json({
        success: true,
        app_id: appId,
        status: 'none',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

router.post(
  '/key-challenge/:wallet',
  async (req: Request, res: Response): Promise<void> => {
    const { wallet } = req.params;

    if (!wallet) {
      res.status(400).json({ success: false, error: 'wallet is required' });
      return;
    }

    try {
      const result = await query(
        `SELECT app_id,
                label,
                status,
                api_key,
                created_at,
                  governance_proposal_id,
                  governance_proposal_dao,
                governance_proposal_status
         FROM partner_keys
         WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [wallet]
      );

      if (result.rows.length === 0) {
        res
          .status(404)
          .json({ success: false, error: 'Application not found' });
        return;
      }

      const row = result.rows[0] as {
        app_id: string;
        label: string;
        status: string;
        api_key: string | null;
        created_at: string;
        governance_proposal_id: number | string | null;
        governance_proposal_dao: string | null;
        governance_proposal_status: string | null;
      };

      const syncedRow = await syncGovernanceProposalState(row);
      if (syncedRow.status !== 'approved') {
        res.status(409).json({
          success: false,
          error: 'API key is only claimable after approval',
          status: syncedRow.status,
        });
        return;
      }

      res.json({
        success: true,
        challenge: buildPartnerKeyClaimChallenge(wallet, syncedRow.app_id),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

router.post(
  '/claim-key/:wallet',
  async (req: Request, res: Response): Promise<void> => {
    const { wallet } = req.params;
    const { account_id, public_key, signature, message } = (req.body ?? {}) as {
      account_id?: string;
      public_key?: string;
      signature?: string;
      message?: string;
    };

    if (!wallet) {
      res.status(400).json({ success: false, error: 'wallet is required' });
      return;
    }

    if (!account_id || !public_key || !signature || !message) {
      res.status(400).json({
        success: false,
        error: 'account_id, public_key, signature, and message are required',
      });
      return;
    }

    try {
      const result = await query(
        `SELECT app_id,
                label,
                status,
                api_key,
                created_at,
                  governance_proposal_id,
                  governance_proposal_dao,
                governance_proposal_status
         FROM partner_keys
         WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [wallet]
      );

      if (result.rows.length === 0) {
        res
          .status(404)
          .json({ success: false, error: 'Application not found' });
        return;
      }

      const row = result.rows[0] as {
        app_id: string;
        label: string;
        status: string;
        api_key: string | null;
        created_at: string;
        governance_proposal_id: number | string | null;
        governance_proposal_dao: string | null;
        governance_proposal_status: string | null;
      };

      const syncedRow = await syncGovernanceProposalState(row);
      if (syncedRow.status !== 'approved' || !syncedRow.api_key) {
        res.status(409).json({
          success: false,
          error: 'API key is only claimable after approval',
          status: syncedRow.status,
        });
        return;
      }

      const verification = await verifyPartnerKeyClaim({
        expectedWalletId: wallet,
        expectedAppId: syncedRow.app_id,
        accountId: account_id,
        publicKey: public_key,
        signature,
        message,
      });

      if (!verification.valid) {
        res.status(401).json({
          success: false,
          error: verification.error ?? 'Claim verification failed',
        });
        return;
      }

      res.json({
        success: true,
        app_id: syncedRow.app_id,
        label: row.label,
        api_key: syncedRow.api_key,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /v1/partners/proposal-submitted/:appId — record direct DAO proposal tx
// ---------------------------------------------------------------------------

router.post(
  '/proposal-submitted/:appId',
  async (req: Request, res: Response): Promise<void> => {
    const { appId } = req.params;
    const { wallet_id, proposal_id, tx_hash, submitted_at } = (req.body ??
      {}) as {
      wallet_id?: string;
      proposal_id?: number | string | null;
      tx_hash?: string;
      submitted_at?: string;
    };

    if (!wallet_id) {
      res.status(400).json({ success: false, error: 'wallet_id is required' });
      return;
    }

    if (!tx_hash) {
      res.status(400).json({ success: false, error: 'tx_hash is required' });
      return;
    }

    try {
      const existing = await query(
        `SELECT status,
                wallet_id,
                governance_proposal_description,
                governance_proposal_dao,
                governance_proposal_payload
         FROM partner_keys
         WHERE app_id = $1`,
        [appId]
      );

      if (existing.rows.length === 0) {
        res
          .status(404)
          .json({ success: false, error: 'Application not found' });
        return;
      }

      const row = existing.rows[0] as {
        status: string;
        wallet_id: string | null;
        governance_proposal_description: string | null;
        governance_proposal_dao: string | null;
        governance_proposal_payload: GovernanceProposalPayload | string | null;
      };

      if (row.wallet_id !== wallet_id) {
        res.status(403).json({ success: false, error: 'Wallet mismatch' });
        return;
      }

      if (
        row.status !== 'ready_for_governance' &&
        row.status !== 'proposal_submitted'
      ) {
        res.status(409).json({
          success: false,
          error:
            'Only governance-ready applications can record proposal submission',
        });
        return;
      }

      const normalizedProposalId =
        proposal_id === null || proposal_id === undefined || proposal_id === ''
          ? null
          : Number(proposal_id);

      if (
        normalizedProposalId !== null &&
        !Number.isFinite(normalizedProposalId)
      ) {
        res
          .status(400)
          .json({ success: false, error: 'proposal_id is invalid' });
        return;
      }

      const normalizedSubmittedAt = submitted_at || new Date().toISOString();

      await query(
        `UPDATE partner_keys
         SET status = 'proposal_submitted',
             governance_proposal_id = $1,
             governance_proposal_status = 'submitted',
             governance_proposal_tx_hash = $2,
             governance_proposal_submitted_at = $3
         WHERE app_id = $4`,
        [normalizedProposalId, tx_hash, normalizedSubmittedAt, appId]
      );

      res.json({
        success: true,
        app_id: appId,
        status: 'proposal_submitted',
        governance_proposal: {
          proposal_id: normalizedProposalId,
          status: 'submitted',
          description: row.governance_proposal_description,
          dao_account: row.governance_proposal_dao,
          tx_hash,
          submitted_at: normalizedSubmittedAt,
          payload: parseGovernancePayload(row.governance_proposal_payload),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /v1/partners/rotate-key/:wallet — rotate API key (wallet-authenticated)
// ---------------------------------------------------------------------------
// The partner portal calls this when the user clicks "Rotate Key".
// Requires the current API key in the X-Api-Key header as proof of ownership.
// ---------------------------------------------------------------------------

router.post(
  '/rotate-key/:wallet',
  async (req: Request, res: Response): Promise<void> => {
    const { wallet } = req.params;
    const currentKey = req.headers['x-api-key']?.toString();

    if (!wallet) {
      res.status(400).json({ success: false, error: 'wallet is required' });
      return;
    }

    if (!currentKey) {
      res
        .status(401)
        .json({ success: false, error: 'X-Api-Key header required' });
      return;
    }

    try {
      // Fetch the approved row for this wallet
      const result = await query(
        `SELECT id, app_id, api_key FROM partner_keys
         WHERE wallet_id = $1 AND status = 'approved' AND active = true
         ORDER BY created_at DESC LIMIT 1`,
        [wallet]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          error: 'No active partner found for this wallet',
        });
        return;
      }

      const row = result.rows[0] as {
        id: number;
        app_id: string;
        api_key: string;
      };

      // Constant-time comparison of current key
      const storedBuf = Buffer.from(row.api_key);
      const providedBuf = Buffer.from(currentKey);
      if (
        storedBuf.length !== providedBuf.length ||
        !timingSafeEqual(storedBuf, providedBuf)
      ) {
        res.status(403).json({ success: false, error: 'Invalid API key' });
        return;
      }

      // Generate new key and update
      const newKey = generateApiKey();
      await query(`UPDATE partner_keys SET api_key = $1 WHERE id = $2`, [
        newKey,
        row.id,
      ]);

      logger.info({ appId: row.app_id, wallet }, 'Partner API key rotated');

      res.json({
        success: true,
        app_id: row.app_id,
        api_key: newKey,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ wallet, error: msg }, 'Key rotation failed');
      res.status(500).json({ success: false, error: 'Key rotation failed' });
    }
  }
);

export default router;
