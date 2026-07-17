/**
 * WebAuthn service — M4.1: registration options
 * Uses @simplewebauthn/server v13.
 */
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server';
import pool from '../db/pool';
import config from '../lib/config';

// ── Relying Party config ───────────────────────────────────────────────────
const RP_NAME = 'TrustLine';
// For local dev: 'localhost'. In production, set via env.
const RP_ID = process.env.WEBAUTHN_RP_ID ?? 'localhost';

// ── In-memory challenge store ──────────────────────────────────────────────
// Maps email → base64url-encoded challenge.
// Good enough for dev; replace with Redis in production (M7 hardening).
const challengeStore = new Map<string, string>();

export { challengeStore };

// ── generateRegistrationOptionsForUser ────────────────────────────────────
export async function generateRegistrationOptionsForUser(
  email: string
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  // 1. Upsert user — create if not present
  const { rows } = await pool.query<{ id: string; email: string }>(
    `INSERT INTO users (email, display_name)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id, email`,
    [email, email.split('@')[0]] // display_name defaults to local-part of email
  );
  const user = rows[0];

  // 2. Fetch any existing credentials to exclude them (prevents duplicate registration)
  const { rows: existingCreds } = await pool.query<{ credential_id: string }>(
    `SELECT credential_id FROM webauthn_credentials WHERE user_id = $1`,
    [user.id]
  );

  // 3. Generate options
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: email,
    attestationType: 'none',
    excludeCredentials: existingCreds.map((c) => ({
      id: c.credential_id,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  // 4. Store the challenge so it can be verified in M4.2
  challengeStore.set(email, options.challenge);

  return options;
}

// Suppress unused import warning — config is a side-effect import for env validation
void config;
