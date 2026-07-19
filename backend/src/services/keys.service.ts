// Ed25519 signing keypair management.
// Private keys are stored AES-256-GCM encrypted. Existing records can be
// migrated from a configured previous secret on their next successful use.
import { createHash, generateKeyPairSync, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import pool from '../db/pool';
import config from '../lib/config';

// ── Encryption helpers ────────────────────────────────────────────────────

// Derive a 32-byte AES key from a configured encryption secret via SHA-256.
function deriveEncryptionKey(secret = config.SIGNING_KEY_ENCRYPTION_SECRET): Buffer {
  return createHash('sha256').update(secret).digest();
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
function decryptWithSecret(encrypted: string, secret: string): string {
  const [ivHex, tagHex, ciphertextHex] = encrypted.split(':');
  const key = deriveEncryptionKey(secret);
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Decrypt using the active signing-key encryption secret.
export function decryptPrivateKey(encrypted: string): string {
  return decryptWithSecret(encrypted, config.SIGNING_KEY_ENCRYPTION_SECRET);
}

export function decryptPrivateKeyWithMigration(encrypted: string): {
  privateKeyPem: string;
  needsReencryption: boolean;
} {
  try {
    return { privateKeyPem: decryptPrivateKey(encrypted), needsReencryption: false };
  } catch (primaryError) {
    for (const previousSecret of config.SIGNING_KEY_PREVIOUS_ENCRYPTION_SECRETS) {
      if (previousSecret === config.SIGNING_KEY_ENCRYPTION_SECRET) continue;
      try {
        return { privateKeyPem: decryptWithSecret(encrypted, previousSecret), needsReencryption: true };
      } catch {
        // Try the next explicitly configured legacy secret without logging it.
      }
    }
    throw primaryError;
  }
}

// generateKeypairForUser — called from verifyRegistration after a successful
// WebAuthn ceremony. Idempotent: if a key already exists it is left unchanged.
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

export async function updateEncryptedPrivateKey(userId: string, encryptedPrivateKey: string): Promise<void> {
  await pool.query(
    'UPDATE signing_keys SET encrypted_private_key = $1 WHERE user_id = $2',
    [encryptedPrivateKey, userId]
  );
}
