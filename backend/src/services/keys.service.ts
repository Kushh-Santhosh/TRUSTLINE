/**
 * M6.1 — Keys service
 * Generates Ed25519 signing keypairs for approvers.
 * Public key stored in plaintext PEM.
 * Private key encrypted with AES-256-GCM, key derived from config.JWT_SECRET.
 */
import { createHash, generateKeyPairSync, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import pool from '../db/pool';
import config from '../lib/config';

// ── Encryption helpers ────────────────────────────────────────────────────

// Derive a 32-byte AES key from JWT_SECRET via SHA-256 (hackathon scope)
function deriveEncryptionKey(): Buffer {
  return createHash('sha256').update(config.JWT_SECRET).digest();
}

// Encrypt a string with AES-256-GCM; returns "iv:tag:ciphertext" in hex
export function encryptPrivateKey(plaintext: string): string {
  const key = deriveEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv.toString('hex'), tag.toString('hex'), ciphertext.toString('hex')].join(':');
}

// Decrypt a string produced by encryptPrivateKey
export function decryptPrivateKey(encrypted: string): string {
  const [ivHex, tagHex, ciphertextHex] = encrypted.split(':');
  const key = deriveEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// ── generateKeypairForUser ────────────────────────────────────────────────
// Called from verifyRegistration (M6.1) after a successful WebAuthn ceremony.
// Idempotent: if a key already exists for the user it is left unchanged.
export async function generateKeypairForUser(userId: string): Promise<void> {
  // 1. Generate Ed25519 keypair
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // 2. Encrypt the private key
  const encryptedPrivateKey = encryptPrivateKey(privateKey);

  // 3. Persist — INSERT ... ON CONFLICT DO NOTHING (idempotent)
  await pool.query(
    `INSERT INTO signing_keys (user_id, public_key, encrypted_private_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, publicKey, encryptedPrivateKey]
  );
}

// ── getPublicKey ──────────────────────────────────────────────────────────
// Returns the PEM public key for a user, or null if not found.
export async function getPublicKey(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ public_key: string }>(
    'SELECT public_key FROM signing_keys WHERE user_id = $1',
    [userId]
  );
  return rows[0]?.public_key ?? null;
}

// ── getEncryptedPrivateKey ────────────────────────────────────────────────
// Returns the encrypted private key blob for a user (used by signing.service.ts in M6.2).
export async function getEncryptedPrivateKey(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ encrypted_private_key: string }>(
    'SELECT encrypted_private_key FROM signing_keys WHERE user_id = $1',
    [userId]
  );
  return rows[0]?.encrypted_private_key ?? null;
}
