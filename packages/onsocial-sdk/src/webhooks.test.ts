import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from './webhooks.js';

function sign(
  body: string,
  timestamp: string,
  secret: string
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
}

describe('verifyWebhookSignature', () => {
  const secret = 'test-secret-abc123';
  const body = JSON.stringify({ event: 'notification.created', id: '1' });
  const timestamp = new Date().toISOString();

  it('returns true for valid signature', () => {
    const signature = sign(body, timestamp, secret);
    expect(
      verifyWebhookSignature({ body, signature, timestamp, secret })
    ).toBe(true);
  });

  it('returns false for wrong signature', () => {
    expect(
      verifyWebhookSignature({
        body,
        signature: 'bad'.repeat(21) + 'bad',
        timestamp,
        secret,
      })
    ).toBe(false);
  });

  it('returns false for wrong secret', () => {
    const signature = sign(body, timestamp, 'wrong-secret');
    expect(
      verifyWebhookSignature({ body, signature, timestamp, secret })
    ).toBe(false);
  });

  it('returns false for tampered body', () => {
    const signature = sign(body, timestamp, secret);
    const tampered = body.replace('"1"', '"2"');
    expect(
      verifyWebhookSignature({
        body: tampered,
        signature,
        timestamp,
        secret,
      })
    ).toBe(false);
  });

  it('rejects expired timestamps (replay attack)', () => {
    const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const signature = sign(body, oldTimestamp, secret);
    expect(
      verifyWebhookSignature({
        body,
        signature,
        timestamp: oldTimestamp,
        secret,
      })
    ).toBe(false);
  });

  it('accepts timestamps within the window', () => {
    const recentTimestamp = new Date(
      Date.now() - 2 * 60 * 1000
    ).toISOString(); // 2 min ago
    const signature = sign(body, recentTimestamp, secret);
    expect(
      verifyWebhookSignature({
        body,
        signature,
        timestamp: recentTimestamp,
        secret,
      })
    ).toBe(true);
  });

  it('respects custom maxAgeMs', () => {
    const recentTimestamp = new Date(
      Date.now() - 2 * 60 * 1000
    ).toISOString();
    const signature = sign(body, recentTimestamp, secret);
    // With 1-minute max age, 2-minute-old timestamp should be rejected
    expect(
      verifyWebhookSignature({
        body,
        signature,
        timestamp: recentTimestamp,
        secret,
        maxAgeMs: 60_000,
      })
    ).toBe(false);
  });

  it('rejects invalid timestamp strings', () => {
    const signature = sign(body, 'not-a-date', secret);
    expect(
      verifyWebhookSignature({
        body,
        signature,
        timestamp: 'not-a-date',
        secret,
      })
    ).toBe(false);
  });

  it('rejects signature of different length (constant-time)', () => {
    expect(
      verifyWebhookSignature({
        body,
        signature: 'short',
        timestamp,
        secret,
      })
    ).toBe(false);
  });
});
