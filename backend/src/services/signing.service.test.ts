/**
 * M9.2 — Unit tests: signing and verification
 * Tests the existing signing.service.ts.
 *
 * Strategy:
 *  - Generate a test Ed25519 keypair inline (no DB, no filesystem).
 *  - Mock keys.service so sign() and verifyForUser() use the test keypair.
 *  - Test verify() directly (it's a pure synchronous function).
 *
 * Playbook-required cases:
 *   1. sign → verify succeeds
 *   2. mutated payload → verify fails
 *   3. incorrect public key → verify fails
 *   4. malformed signature → handled correctly
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { generateKeyPairSync, sign as rawSign } from 'crypto';

// ── Test keypair (generated once per test run, stored in module scope) ────

let PUBLIC_KEY_PEM  = '';
let PRIVATE_KEY_PEM = '';
let PUBLIC_KEY_PEM2 = '';   // second keypair for "wrong key" tests

beforeAll(() => {
  const kp1 = generateKeyPairSync('ed25519', {
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  PUBLIC_KEY_PEM  = kp1.publicKey;
  PRIVATE_KEY_PEM = kp1.privateKey;

  const kp2 = generateKeyPairSync('ed25519', {
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  PUBLIC_KEY_PEM2 = kp2.publicKey;
});

// ── Mock keys.service BEFORE importing signing.service ───────────────────
// vi.mock() is hoisted by vitest so it applies to all imports below.

vi.mock('./keys.service', () => ({
  getEncryptedPrivateKey: vi.fn().mockResolvedValue('MOCK_ENCRYPTED_KEY'),
  decryptPrivateKey:      vi.fn().mockImplementation(() => PRIVATE_KEY_PEM),
  getPublicKey:           vi.fn().mockResolvedValue(() => PUBLIC_KEY_PEM),
}));

// Imports resolved AFTER mock is registered (vitest hoists vi.mock)
import { sign, verify, verifyForUser } from './signing.service';
import { getPublicKey } from './keys.service';

// ── Canonical helper (mirrors signing.service internals) ──────────────────

function canonicalize(payload: object): Buffer {
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return Buffer.from(sorted, 'utf8');
}

function signWithTestKey(payload: object): string {
  const data = canonicalize(payload);
  return rawSign(null, data, PRIVATE_KEY_PEM).toString('base64');
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('verify() — pure synchronous function', () => {

  const payload = { action: 'approve', requestId: 'req-001', userId: 'u-abc' };

  it('valid signature → true', () => {
    const sig = signWithTestKey(payload);
    expect(verify(PUBLIC_KEY_PEM, payload, sig)).toBe(true);
  });

  it('mutated payload (one field changed) → false', () => {
    const sig = signWithTestKey(payload);
    const tampered = { ...payload, requestId: 'req-TAMPERED' };
    expect(verify(PUBLIC_KEY_PEM, tampered, sig)).toBe(false);
  });

  it('mutated payload (extra field added) → false', () => {
    const sig = signWithTestKey(payload);
    const tampered = { ...payload, extra: 'injected' } as object;
    expect(verify(PUBLIC_KEY_PEM, tampered, sig)).toBe(false);
  });

  it('mutated payload (field removed) → false', () => {
    const sig = signWithTestKey(payload);
    const { userId: _omit, ...tampered } = payload;
    expect(verify(PUBLIC_KEY_PEM, tampered, sig)).toBe(false);
  });

  it('incorrect public key (different keypair) → false', () => {
    const sig = signWithTestKey(payload);
    expect(verify(PUBLIC_KEY_PEM2, payload, sig)).toBe(false);
  });

  it('malformed signature (random base64) → false', () => {
    // verify() must return false rather than throw for bad-but-valid-base64 sigs
    const badSig = Buffer.alloc(64, 0).toString('base64');
    expect(verify(PUBLIC_KEY_PEM, payload, badSig)).toBe(false);
  });

  it('malformed signature (not base64) — handled safely', () => {
    // Non-base64 input: Buffer.from will silently produce garbage bytes;
    // verify() should return false (not throw).
    expect(() => verify(PUBLIC_KEY_PEM, payload, '!!not-base64!!')).not.toThrow();
  });

  it('empty signature string → throws "signature must be a non-empty string"', () => {
    expect(() => verify(PUBLIC_KEY_PEM, payload, '')).toThrow(
      'signature must be a non-empty string'
    );
  });

  it('empty publicKeyPem → throws "publicKeyPem must be a non-empty string"', () => {
    const sig = signWithTestKey(payload);
    expect(() => verify('', payload, sig)).toThrow(
      'publicKeyPem must be a non-empty string'
    );
  });

  it('array payload → throws "payload must be a non-null, non-array object"', () => {
    const sig = signWithTestKey(payload);
    expect(() => verify(PUBLIC_KEY_PEM, [] as unknown as object, sig)).toThrow(
      'payload must be a non-null, non-array object'
    );
  });

  // ── Determinism ──────────────────────────────────────────────────────────

  it('canonical serialisation is deterministic: different key insertion order → same signature', () => {
    // Object A: keys in natural insertion order
    const payloadA = { userId: 'u1', requestId: 'r1', action: 'approve' };
    // Object B: same keys, different insertion order
    const payloadB = { action: 'approve', requestId: 'r1', userId: 'u1' };

    const sigA = signWithTestKey(payloadA);
    const sigB = signWithTestKey(payloadB);

    // Both signatures should verify against both objects (same canonical bytes)
    expect(verify(PUBLIC_KEY_PEM, payloadA, sigA)).toBe(true);
    expect(verify(PUBLIC_KEY_PEM, payloadB, sigA)).toBe(true);
    expect(sigA).toBe(sigB);
  });

  it('same payload signed twice produces same signature (Ed25519 is deterministic)', () => {
    const sig1 = signWithTestKey(payload);
    const sig2 = signWithTestKey(payload);
    expect(sig1).toBe(sig2);
  });
});

// ── sign() — mocked keys.service ─────────────────────────────────────────

describe('sign() — via mocked keys.service', () => {

  it('returns a non-empty base64 string', async () => {
    const sig = await sign('user-1', { action: 'approve', requestId: 'r-001' });
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
    // base64 characters only
    expect(sig).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('produced signature verifies against test public key', async () => {
    const p = { action: 'approve', requestId: 'r-002' };
    const sig = await sign('user-1', p);
    expect(verify(PUBLIC_KEY_PEM, p, sig)).toBe(true);
  });

  it('array payload → throws', async () => {
    await expect(sign('user-1', [] as unknown as object)).rejects.toThrow(
      'payload must be a non-null, non-array object'
    );
  });
});

// ── verifyForUser() — mocked getPublicKey ────────────────────────────────

describe('verifyForUser() — via mocked keys.service', () => {

  it('returns true when signature matches stored public key', async () => {
    vi.mocked(getPublicKey).mockResolvedValueOnce(PUBLIC_KEY_PEM);
    const p = { action: 'deny', requestId: 'r-003' };
    const sig = signWithTestKey(p);
    expect(await verifyForUser('user-1', p, sig)).toBe(true);
  });

  it('returns false when user has no stored public key', async () => {
    vi.mocked(getPublicKey).mockResolvedValueOnce(null);
    const sig = signWithTestKey({ action: 'approve' });
    expect(await verifyForUser('ghost-user', { action: 'approve' }, sig)).toBe(false);
  });

  it('returns false when signature is for a different key', async () => {
    vi.mocked(getPublicKey).mockResolvedValueOnce(PUBLIC_KEY_PEM2);
    const p = { action: 'approve', requestId: 'r-004' };
    const sig = signWithTestKey(p); // signed with KEY1 private
    expect(await verifyForUser('user-1', p, sig)).toBe(false); // checked against KEY2 public
  });
});
