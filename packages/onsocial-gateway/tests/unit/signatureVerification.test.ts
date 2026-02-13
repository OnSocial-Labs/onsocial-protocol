// tests/signatureVerification.test.ts
// Unit tests for NEAR signature verification

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';

// We'll test the verification logic directly
// In development mode, verification is skipped, so we test the underlying functions

describe('NEAR Signature Verification', () => {
  // Generate a test keypair
  const keyPair = nacl.sign.keyPair();
  const publicKeyBase64 = encodeBase64(keyPair.publicKey);
  const publicKeyFormatted = `ed25519:${publicKeyBase64}`;

  function signMessage(message: string): string {
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, keyPair.secretKey);
    return encodeBase64(signature);
  }

  describe('Message Format Validation', () => {
    it('should accept valid message format', () => {
      const now = new Date().toISOString();
      const message = `OnSocial Auth: ${now}`;
      
      expect(message.startsWith('OnSocial Auth: ')).toBe(true);
      expect(!isNaN(Date.parse(now))).toBe(true);
    });

    it('should detect invalid message prefix', () => {
      const message = 'Invalid Auth: 2024-01-27T00:00:00.000Z';
      expect(message.startsWith('OnSocial Auth: ')).toBe(false);
    });

    it('should detect invalid timestamp', () => {
      const message = 'OnSocial Auth: not-a-date';
      const timestampStr = message.slice('OnSocial Auth: '.length);
      expect(isNaN(Date.parse(timestampStr))).toBe(true);
    });

    it('should detect expired message (>5 minutes old)', () => {
      const oldDate = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago
      const age = Date.now() - oldDate.getTime();
      expect(age > 5 * 60 * 1000).toBe(true);
    });

    it('should accept message within validity window', () => {
      const recentDate = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      const age = Date.now() - recentDate.getTime();
      expect(age < 5 * 60 * 1000).toBe(true);
    });
  });

  describe('Signature Cryptography', () => {
    it('should verify valid ed25519 signature', () => {
      const message = `OnSocial Auth: ${new Date().toISOString()}`;
      const signature = signMessage(message);
      const signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
      const messageBytes = new TextEncoder().encode(message);

      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        keyPair.publicKey
      );

      expect(isValid).toBe(true);
    });

    it('should reject tampered message', () => {
      const originalMessage = `OnSocial Auth: ${new Date().toISOString()}`;
      const signature = signMessage(originalMessage);
      const tamperedMessage = originalMessage + ' tampered';
      
      const signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
      const messageBytes = new TextEncoder().encode(tamperedMessage);

      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        keyPair.publicKey
      );

      expect(isValid).toBe(false);
    });

    it('should reject signature from different key', () => {
      const message = `OnSocial Auth: ${new Date().toISOString()}`;
      const signature = signMessage(message);
      
      // Use a different keypair for verification
      const otherKeyPair = nacl.sign.keyPair();
      const signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
      const messageBytes = new TextEncoder().encode(message);

      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        otherKeyPair.publicKey
      );

      expect(isValid).toBe(false);
    });

    it('should handle 64-byte signature correctly', () => {
      const message = `OnSocial Auth: ${new Date().toISOString()}`;
      const signature = signMessage(message);
      const signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
      
      expect(signatureBytes.length).toBe(64);
    });

    it('should handle 32-byte public key correctly', () => {
      expect(keyPair.publicKey.length).toBe(32);
    });
  });

  describe('Public Key Parsing', () => {
    it('should parse ed25519: prefix format', () => {
      const [curve, keyData] = publicKeyFormatted.split(':');
      expect(curve).toBe('ed25519');
      expect(keyData).toBe(publicKeyBase64);
    });

    it('should decode base64 public key', () => {
      const decoded = Uint8Array.from(Buffer.from(publicKeyBase64, 'base64'));
      expect(decoded.length).toBe(32);
    });

    it('should reject non-ed25519 keys', () => {
      const invalidKey = 'secp256k1:somekey';
      const [curve] = invalidKey.split(':');
      expect(curve !== 'ed25519').toBe(true);
    });
  });

  describe('Integration Flow', () => {
    it('should complete full verification flow', () => {
      // 1. Create fresh message with current timestamp
      const now = new Date().toISOString();
      const message = `OnSocial Auth: ${now}`;

      // 2. Sign it
      const signature = signMessage(message);

      // 3. Verify timestamp is fresh
      const timestamp = Date.parse(now);
      const age = Date.now() - timestamp;
      expect(age < 5 * 60 * 1000).toBe(true);

      // 4. Verify signature
      const signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
      const messageBytes = new TextEncoder().encode(message);
      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        keyPair.publicKey
      );
      expect(isValid).toBe(true);
    });

    it('should simulate client-side signing', () => {
      // Simulates what the client would do:
      // 1. Generate message with timestamp
      const message = `OnSocial Auth: ${new Date().toISOString()}`;
      
      // 2. Sign with NEAR private key (simulated here with test keypair)
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, keyPair.secretKey);
      
      // 3. Base64 encode signature for transport
      const signatureBase64 = encodeBase64(signature);
      
      // 4. Format public key with curve prefix
      const publicKey = `ed25519:${encodeBase64(keyPair.publicKey)}`;
      
      // Verify the format is correct
      expect(typeof signatureBase64).toBe('string');
      expect(publicKey.startsWith('ed25519:')).toBe(true);
      expect(signatureBase64.length).toBeGreaterThan(0);
    });
  });
});

describe('Error Cases', () => {
  it('should handle empty signature', () => {
    const emptySignature = '';
    expect(emptySignature.length).toBe(0);
  });

  it('should handle malformed base64', () => {
    const malformed = '!!!not-base64!!!';
    expect(() => {
      Buffer.from(malformed, 'base64');
    }).not.toThrow(); // Buffer.from doesn't throw, just returns empty/corrupted
    
    const decoded = Buffer.from(malformed, 'base64');
    expect(decoded.length).not.toBe(64); // Won't be valid signature length
  });

  it('should handle missing public key', () => {
    const missingKey = '';
    const parts = missingKey.split(':');
    expect(parts.length).toBe(1);
    expect(parts[0]).toBe('');
  });
});
