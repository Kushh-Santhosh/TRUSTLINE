/**
 * M6.2 — Signing service
 * Signs approval-vote payloads with the approver's Ed25519 private key.
 * Verifies signatures against a stored public key.
 *
 * Not wired into any route yet — that happens in M6.3.
 *
 * Canonical serialisation: keys sorted alphabetically before JSON.stringify
 * to guarantee the same byte sequence regardless of object construction order.
 *
 * Signature encoding: base64 (URL-unsafe) — compact, suitable for DB storage.
 */
import { sign as cryptoSign, verify as cryptoVerify } from 'crypto';
import { getEncryptedPrivateKey, getPublicKey, decryptPrivateKey } from './keys.service';

// ── Canonical JSON ────────────────────────────────────────────────────────

function canonicalize(payload: object): Buffer {
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return Buffer.from(sorted, 'utf8');
}

// ── sign ──────────────────────────────────────────────────────────────────
// Fetches and decrypts the user's Ed25519 private key, signs the canonical
// JSON of the payload, and returns a base64-encoded signature string.
export async function sign(userId: string, payload: object): Promise<string> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('payload must be a non-null, non-array object');
  }

  // 1. Retrieve + decrypt private key
  const encryptedPrivateKey = await getEncryptedPrivateKey(userId);
  if (!encryptedPrivateKey) {
    throw new Error(`no signing key found for user ${userId}`);
  }
  const privateKeyPem = decryptPrivateKey(encryptedPrivateKey);

  // 2. Sign canonical payload
  const data = canonicalize(payload);
  const signature = cryptoSign(null, data, privateKeyPem);

  return signature.toString('base64');
}

// ── verify ────────────────────────────────────────────────────────────────
// Verifies a base64-encoded signature against the given PEM public key and
// the canonical JSON of the payload. Returns true if valid, false otherwise.
// Never throws on an invalid signature — only throws on malformed input.
export function verify(publicKeyPem: string, payload: object, signature: string): boolean {
  if (!publicKeyPem || typeof publicKeyPem !== 'string') {
    throw new Error('publicKeyPem must be a non-empty string');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('payload must be a non-null, non-array object');
  }
  if (!signature || typeof signature !== 'string') {
    throw new Error('signature must be a non-empty string');
  }

  const data = canonicalize(payload);
  const sigBuffer = Buffer.from(signature, 'base64');

  return cryptoVerify(null, data, publicKeyPem, sigBuffer);
}

// ── verifyForUser ─────────────────────────────────────────────────────────
// Convenience wrapper: fetches the stored public key for a userId and verifies.
// Returns false if the user has no key or the signature is invalid.
export async function verifyForUser(
  userId: string,
  payload: object,
  signature: string
): Promise<boolean> {
  const publicKey = await getPublicKey(userId);
  if (!publicKey) return false;
  return verify(publicKey, payload, signature);
}
