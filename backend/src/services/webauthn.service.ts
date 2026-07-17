/**
 * WebAuthn service — M4.1: registration options, M4.2: registration verify
 * Uses @simplewebauthn/server v13.
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
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

// ── verifyRegistration ────────────────────────────────────────────────────
export async function verifyRegistration(
  email: string,
  response: RegistrationResponseJSON
): Promise<void> {
  // 1. Retrieve stored challenge
  const expectedChallenge = challengeStore.get(email);
  if (!expectedChallenge) {
    throw new Error('no pending challenge for this email — call /register/options first');
  }

  // 2. Verify the registration response
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    // The browser sends the origin of the page where the ceremony ran
    expectedOrigin: config.FRONTEND_ORIGIN,
    expectedRPID: RP_ID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('registration verification failed');
  }

  const { credential } = verification.registrationInfo;

  // 3. Look up user
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  if (!rows[0]) throw new Error('user not found');

  // 4. Persist credential
  await pool.query(
    `INSERT INTO webauthn_credentials
       (user_id, credential_id, public_key, counter)
     VALUES ($1, $2, $3, $4)`,
    [
      rows[0].id,
      credential.id,
      Buffer.from(credential.publicKey), // bytea
      credential.counter,
    ]
  );

  // 5. Clear challenge — one-time use
  challengeStore.delete(email);
}
