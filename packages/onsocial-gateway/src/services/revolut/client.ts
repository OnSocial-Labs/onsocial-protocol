/**
 * Revolut Merchant API client
 *
 * Wraps the Revolut Merchant API for:
 *   - Customers           (POST /customers, GET /customers)
 *   - Subscription plans   (POST /subscription-plans, GET /subscription-plans)
 *   - Subscriptions        (POST /subscriptions, GET /subscriptions/{id}, POST /subscriptions/{id}/cancel)
 *   - Orders / payments    (POST /orders, GET /orders/{id})
 *   - Webhook verification (HMAC-SHA256)
 *
 * Sandbox: https://sandbox-merchant.revolut.com/api
 * Production: https://merchant.revolut.com/api
 *
 * Auth: Bearer <secretKey> header on every request.
 * Versioning: Revolut-Api-Version header (2025-12-04).
 *
 * @see https://developer.revolut.com/docs/merchant/merchant-api
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '../../logger.js';

// --- Types -----------------------------------------------------------------

export interface RevolutConfig {
  secretKey: string;
  publicKey: string;
  webhookSigningSecret: string;
  apiUrl: string; // https://merchant.revolut.com/api or sandbox
  apiVersion: string; // e.g. '2025-12-04'
}

export interface CreateOrderParams {
  amount: number; // in minor units (cents)
  currency: string; // ISO 4217
  description: string;
  merchantOrderRef: string; // our subscription ID
  customerEmail?: string;
  metadata?: Record<string, string>;
  redirectUrl?: string; // where Revolut redirects after checkout
}

export interface RevolutOrder {
  id: string;
  token: string; // public token for checkout widget
  state: string;
  amount: number;
  currency: string;
  checkout_url: string;
  created_at: string;
  merchant_order_ext_ref?: string;
  metadata?: Record<string, string>;
  payments?: Array<{
    id: string;
    state: string;
    payment_method?: {
      type: string;
      id?: string;
    };
  }>;
  customer?: {
    id?: string;
    email?: string;
  };
}

export interface RevolutPayment {
  id: string;
  order_id: string;
  state: string;
  payment_method?: {
    type: string;
    id?: string;
  };
}

export interface WebhookEvent {
  event: string;
  order_id: string;
  merchant_order_ext_ref?: string;
}

// --- Customer types --------------------------------------------------------

export interface CreateCustomerParams {
  email: string;
  fullName?: string;
}

export interface RevolutCustomer {
  id: string;
  full_name?: string;
  email: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

// --- Subscription plan types -----------------------------------------------

export interface PlanPhaseInput {
  ordinal: number;
  cycle_duration: string; // ISO 8601 duration, e.g. "P1M"
  amount: number; // minor units (cents)
  currency: string; // ISO 4217
  cycle_count?: number; // omit for indefinite
}

export interface PlanVariationInput {
  phases: PlanPhaseInput[];
}

export interface CreatePlanParams {
  name: string;
  variations: PlanVariationInput[];
  trial_duration?: string; // ISO 8601 duration, e.g. "P7D"
}

export interface RevolutPlanPhase {
  id: string;
  ordinal: number;
  cycle_duration: string;
  amount: number;
  currency: string;
  cycle_count?: number;
}

export interface RevolutPlanVariation {
  id: string;
  phases: RevolutPlanPhase[];
}

export interface RevolutPlan {
  id: string;
  name: string;
  state: string;
  created_at: string;
  updated_at: string;
  trial_duration?: string;
  variations: RevolutPlanVariation[];
}

// --- Subscription types ----------------------------------------------------

export interface CreateSubscriptionParams {
  planVariationId: string;
  customerId: string;
  redirectUrl?: string;
  externalReference?: string;
}

export interface RevolutSubscription {
  id: string;
  external_reference?: string;
  state: string; // pending | active | cancelled | finished
  customer_id: string;
  plan_id: string;
  plan_variation_id: string;
  payment_method_type: string; // automatic | manual
  created_at: string;
  updated_at: string;
  setup_order_id?: string;
  current_cycle_id?: string;
}

export interface RevolutCycle {
  id: string;
  subscription_id: string;
  plan_variation_id: string;
  plan_variation_phase_id?: string;
  number: number;
  previous_cycle_id?: string;
  state: string; // active | finished | cancelled
  start_date: string;
  end_date: string;
  order_id: string;
  trial: boolean;
}

// --- Client ----------------------------------------------------------------

export class RevolutClient {
  constructor(private cfg: RevolutConfig) {}

  /**
   * Create a payment order (checkout).
   * The returned checkout_url can redirect the customer to Revolut's hosted page.
   * Uses an idempotency key (merchantOrderRef) to prevent duplicate charges.
   */
  async createOrder(params: CreateOrderParams): Promise<RevolutOrder> {
    return this.request<RevolutOrder>(
      'POST',
      '/orders',
      {
        amount: params.amount,
        currency: params.currency,
        description: params.description,
        merchant_order_ext_ref: params.merchantOrderRef,
        customer: params.customerEmail
          ? { email: params.customerEmail }
          : undefined,
        metadata: params.metadata,
        ...(params.redirectUrl && {
          redirect_url: params.redirectUrl,
        }),
      },
      params.merchantOrderRef
    );
  }

  /**
   * Retrieve an order by ID.
   */
  async getOrder(orderId: string): Promise<RevolutOrder> {
    return this.request<RevolutOrder>('GET', `/orders/${orderId}`);
  }

  // --- Customers -----------------------------------------------------------

  /**
   * Create a customer in Revolut.
   * Required for subscriptions (customer_id is mandatory).
   */
  async createCustomer(params: CreateCustomerParams): Promise<RevolutCustomer> {
    return this.request<RevolutCustomer>(
      'POST',
      '/customers',
      {
        email: params.email,
        ...(params.fullName && { full_name: params.fullName }),
      },
      `customer-${params.email}`
    );
  }

  /**
   * List customers, optionally filtering by email.
   */
  async listCustomers(email?: string): Promise<RevolutCustomer[]> {
    const query = email ? `?email=${encodeURIComponent(email)}` : '';
    return this.request<RevolutCustomer[]>('GET', `/customers${query}`);
  }

  /**
   * Find existing customer by email or create a new one.
   */
  async getOrCreateCustomer(
    email: string,
    fullName?: string
  ): Promise<RevolutCustomer> {
    const existing = await this.listCustomers(email);
    if (existing.length > 0) return existing[0];
    return this.createCustomer({ email, fullName });
  }

  // --- Subscription Plans --------------------------------------------------

  /**
   * Create a subscription plan with one or more pricing variations.
   * Each variation can have multiple phases (e.g., trial → regular).
   */
  async createSubscriptionPlan(params: CreatePlanParams): Promise<RevolutPlan> {
    return this.request<RevolutPlan>('POST', '/subscription-plans', {
      name: params.name,
      variations: params.variations,
      ...(params.trial_duration && { trial_duration: params.trial_duration }),
    });
  }

  /**
   * List all subscription plans.
   */
  async listSubscriptionPlans(): Promise<RevolutPlan[]> {
    const data = await this.request<{ subscription_plans: RevolutPlan[] }>(
      'GET',
      '/subscription-plans'
    );
    return data.subscription_plans;
  }

  // --- Subscriptions -------------------------------------------------------

  /**
   * Create a subscription for a customer.
   * Returns a subscription with a setup_order_id — get that order for checkout_url.
   */
  async createSubscription(
    params: CreateSubscriptionParams
  ): Promise<RevolutSubscription> {
    return this.request<RevolutSubscription>(
      'POST',
      '/subscriptions',
      {
        plan_variation_id: params.planVariationId,
        customer_id: params.customerId,
        ...(params.redirectUrl && {
          setup_order_redirect_url: params.redirectUrl,
        }),
        ...(params.externalReference && {
          external_reference: params.externalReference,
        }),
      },
      `sub-${params.customerId}-${params.planVariationId}`
    );
  }

  /**
   * Retrieve a subscription by ID.
   */
  async getSubscription(subscriptionId: string): Promise<RevolutSubscription> {
    return this.request<RevolutSubscription>(
      'GET',
      `/subscriptions/${subscriptionId}`
    );
  }

  /**
   * Cancel a subscription. No further billing cycles will be created.
   */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.request<void>('POST', `/subscriptions/${subscriptionId}/cancel`);
  }

  /**
   * List billing cycles for a subscription.
   */
  async getSubscriptionCycles(subscriptionId: string): Promise<RevolutCycle[]> {
    const data = await this.request<{ cycles: RevolutCycle[] }>(
      'GET',
      `/subscriptions/${subscriptionId}/cycles`
    );
    return data.cycles;
  }

  /**
   * Retrieve a single cycle by ID.
   */
  async getSubscriptionCycle(
    subscriptionId: string,
    cycleId: string
  ): Promise<RevolutCycle> {
    return this.request<RevolutCycle>(
      'GET',
      `/subscriptions/${subscriptionId}/cycles/${cycleId}`
    );
  }

  /**
   * Verify a Revolut webhook signature (HMAC-SHA256).
   *
   * Header format: Revolut-Signature: v1=<hex_digest>
   * Signed payload: `${version}.${timestamp}.${body}`
   *
   * @see https://developer.revolut.com/docs/guides/accept-payments/tutorials/work-with-webhooks/validate-webhook-signature
   */
  verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    timestampHeader: string
  ): boolean {
    try {
      // Parse "v1=<hex>" from Revolut-Signature header
      const match = signatureHeader.match(/^v1=([a-f0-9]+)$/);
      if (!match) return false;
      const receivedSig = match[1];

      // Build signed payload
      const payload = `v1.${timestampHeader}.${rawBody}`;
      const expectedSig = createHmac('sha256', this.cfg.webhookSigningSecret)
        .update(payload)
        .digest('hex');

      // Timing-safe comparison
      const a = Buffer.from(receivedSig, 'hex');
      const b = Buffer.from(expectedSig, 'hex');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch (err) {
      logger.warn({ err }, 'Webhook signature verification error');
      return false;
    }
  }

  // --- Internal HTTP -------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string
  ): Promise<T> {
    const url = `${this.cfg.apiUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.secretKey}`,
      'Revolut-Api-Version': this.cfg.apiVersion,
      'Content-Type': 'application/json',
    };

    if (idempotencyKey && method === 'POST') {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, path, body: text },
        'Revolut API error'
      );
      throw new Error(`Revolut API ${method} ${path}: ${res.status} ${text}`);
    }

    return (await res.json()) as T;
  }
}
