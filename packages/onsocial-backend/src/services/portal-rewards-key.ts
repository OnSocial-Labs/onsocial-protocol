import { config } from '../config/index.js';
import { query } from '../db/index.js';
import { logger } from '../logger.js';

export async function ensurePortalRewardsPartnerKey(): Promise<void> {
  const apiKey = config.portalRewardsApiKey.trim();
  if (!apiKey) {
    logger.warn(
      'ONSOCIAL_PORTAL_REWARDS_API_KEY is not set; Portal reward credits will be rejected'
    );
    return;
  }

  await query(
    `INSERT INTO partner_keys (
       api_key,
       app_id,
       label,
       active,
       status,
       description,
       expected_users,
       contact,
       admin_notes,
       reviewed_at
     ) VALUES (
       $1,
       $2,
       'OnSocial Portal rewards',
       true,
       'approved',
       'Internal key used by the OnSocial Portal server to credit verified onboarding and social rewards.',
       'Internal portal traffic',
       'protocol',
       'Provisioned from ONSOCIAL_PORTAL_REWARDS_API_KEY at backend startup',
       now()
     )
     ON CONFLICT (app_id) DO UPDATE
     SET api_key = EXCLUDED.api_key,
         label = EXCLUDED.label,
         active = true,
         status = 'approved',
         admin_notes = EXCLUDED.admin_notes,
         reviewed_at = now()`,
    [apiKey, config.portalRewardsAppId]
  );

  logger.info(
    { appId: config.portalRewardsAppId },
    'Portal rewards partner key is provisioned'
  );
}
