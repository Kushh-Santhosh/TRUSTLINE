/**
 * WebAuthn service — M4.1: registration options, M4.2: registration verify
 * Uses @simplewebauthn/server v13.
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import pool from '../db/pool';
import config from '../lib/config';
import { generateKeypairForUser } from './keys.service';
import logger from '../lib/logger';

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
): Promise<{ userId: string }> {
  // 1. Retrieve stored challenge
  const expectedChallenge = challengeStore.get(email);
  if (!expectedChallenge) {
    throw new Error('no pending challenge for this email — call /register/options first');
  }

  // 2. Verify the registration response
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    // The browser sends the origin of the page where the ceremony ran.
    // SimpleWebAuthn accepts an array, which keeps both local Vite ports valid.
    expectedOrigin: config.FRONTEND_ORIGINS,
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

  // 5. Generate Ed25519 signing keypair for this user (M6.1)
  //    Non-fatal: if key generation fails, log and continue — credential is already persisted.
  try {
    await generateKeypairForUser(rows[0].id);
  } catch (err) {
    logger.error({ err, userId: rows[0].id }, 'keys.service: keypair generation failed after registration');
  }

  // 6. Clear challenge — one-time use
  challengeStore.delete(email);

  return { userId: rows[0].id };
}

// ── Login challenge store (separate from registration challenge store) ─────
// Maps email → base64url-encoded authentication challenge.
const loginChallengeStore = new Map<string, string>();

export { loginChallengeStore };

// ── generateLoginOptionsForUser ────────────────────────────────────────────
export async function generateLoginOptionsForUser(
  email: string
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  // 1. Look up user
  const { rows: users } = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  if (!users[0]) {
    // Don't reveal whether the user exists — generic error
    throw new Error('no credentials found for this email');
  }

  // 2. Load all registered credentials for this user
  const { rows: creds } = await pool.query<{ credential_id: string }>(
    'SELECT credential_id FROM webauthn_credentials WHERE user_id = $1',
    [users[0].id]
  );
  if (creds.length === 0) {
    throw new Error('no credentials found for this email');
  }

  // 3. Generate authentication options
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: creds.map((c) => ({ id: c.credential_id })),
    userVerification: 'preferred',
  });

  // 4. Store challenge for verification in M4.5
  loginChallengeStore.set(email, options.challenge);

  return options;
}

// ── verifyLogin ────────────────────────────────────────────────────────
export async function verifyLogin(
  email: string,
  response: AuthenticationResponseJSON
): Promise<string> { // returns userId
  // 1. Retrieve stored login challenge
  const expectedChallenge = loginChallengeStore.get(email);
  if (!expectedChallenge) {
    throw new Error('no pending login challenge — call /login/options first');
  }

  // 2. Look up user + matching credential
  const { rows: users } = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  if (!users[0]) throw new Error('user not found');
  const userId = users[0].id;

  const credentialId = response.id;
  const { rows: creds } = await pool.query<{
    id: string;
    public_key: Buffer;
    counter: number;
  }>(
    `SELECT id, public_key, counter
     FROM webauthn_credentials
     WHERE user_id = $1 AND credential_id = $2`,
    [userId, credentialId]
  );
  if (!creds[0]) throw new Error('credential not found');

  const storedCred = creds[0];

  // 3. Verify assertion
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.FRONTEND_ORIGINS,
    expectedRPID: RP_ID,
    credential: {
      id: credentialId,
      publicKey: new Uint8Array(storedCred.public_key),
      counter: Number(storedCred.counter),
    },
  });

  if (!verification.verified) {
    throw new Error('authentication verification failed');
  }

  // 4. Update the credential counter (prevents replay attacks)
  const { authenticationInfo } = verification;
  await pool.query(
    'UPDATE webauthn_credentials SET counter = $1 WHERE id = $2',
    [authenticationInfo.newCounter, storedCred.id]
  );

  // 5. Clear login challenge — one-time use
  loginChallengeStore.delete(email);

  return userId;
}
