// ---------------------------------------------------------------------------
// Webhooks module — manage notification webhook endpoints
// ---------------------------------------------------------------------------

import { createHmac } from 'node:crypto';
import type { HttpClient } from './http.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface WebhookEndpoint {
  id: string;
  ownerAccountId: string;
  appId: string;
  url: string;
  signingSecret: string;
  active: boolean;
  createdAt: number;
}

export interface CreateWebhookParams {
  /** App namespace. Falls back to the SDK-level `appId` (default: `'default'`). */
  appId?: string;
  /** HTTPS URL that will receive webhook POST requests. */
  url: string;
}

// ── Module ─────────────────────────────────────────────────────────────────

export class WebhooksModule {
  private readonly defaultAppId: string;

  constructor(
    private readonly http: HttpClient,
    appId?: string
  ) {
    this.defaultAppId = appId ?? 'default';
  }

  /**
   * Register a webhook endpoint for an app.
   * Requires pro tier or above.
   *
   * ```ts
   * const webhook = await os.webhooks.create({
   *   appId: 'myapp',
   *   url: 'https://myapp.com/api/onsocial-events',
   * });
   * console.log(webhook.signingSecret); // save this — used to verify payloads
   * ```
   */
  async create(params: CreateWebhookParams): Promise<WebhookEndpoint> {
    const res = await this.http.post<{ webhook: WebhookEndpoint }>(
      '/developer/notifications/webhooks',
      { appId: params.appId ?? this.defaultAppId, url: params.url }
    );
    return res.webhook;
  }

  /**
   * List all webhook endpoints for the authenticated account.
   */
  async list(): Promise<WebhookEndpoint[]> {
    const res = await this.http.get<{ webhooks: WebhookEndpoint[] }>(
      '/developer/notifications/webhooks'
    );
    return res.webhooks;
  }

  /**
   * Delete a webhook endpoint by ID.
   */
  async delete(id: string): Promise<void> {
    await this.http.delete<{ status: string }>(
      `/developer/notifications/webhooks/${id}`
    );
  }
}

// ── Signature verification (standalone — no client needed) ─────────────────

/**
 * Verify an incoming OnSocial webhook signature.
 *
 * Use this in your webhook handler to ensure the request came from OnSocial.
 *
 * ```ts
 * import { verifyWebhookSignature } from '@onsocial/sdk';
 *
 * app.post('/api/onsocial-events', (req, res) => {
 *   const valid = verifyWebhookSignature({
 *     body: JSON.stringify(req.body),
 *     signature: req.headers['x-onsocial-webhook-signature'] as string,
 *     timestamp: req.headers['x-onsocial-webhook-timestamp'] as string,
 *     secret: process.env.WEBHOOK_SECRET!,
 *   });
 *   if (!valid) return res.status(401).send('Invalid signature');
 *
 *   // Handle the event
 *   const { event, notification } = req.body;
 *   console.log(event, notification.type, notification.recipient);
 *   res.status(200).send('ok');
 * });
 * ```
 */
export function verifyWebhookSignature(params: {
  /** Raw JSON body string. */
  body: string;
  /** Value of `x-onsocial-webhook-signature` header. */
  signature: string;
  /** Value of `x-onsocial-webhook-timestamp` header. */
  timestamp: string;
  /** The signing secret returned when the webhook was created. */
  secret: string;
  /** Maximum age in ms (default: 5 minutes). Rejects replayed requests. */
  maxAgeMs?: number;
}): boolean {
  const maxAge = params.maxAgeMs ?? 5 * 60 * 1000;

  // Check timestamp freshness to prevent replay attacks
  const ts = new Date(params.timestamp).getTime();
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > maxAge) {
    return false;
  }

  const expected = createHmac('sha256', params.secret)
    .update(`${params.timestamp}.${params.body}`)
    .digest('hex');

  // Constant-time comparison
  if (expected.length !== params.signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ params.signature.charCodeAt(i);
  }
  return mismatch === 0;
}
