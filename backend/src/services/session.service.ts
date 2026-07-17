/**
 * M4.5 — Session issuance service
 * M4.8 — Refresh token rotation with family-based reuse detection
 * M6.5 — Audit logging for login events
 *
 * Refresh tokens are stored hashed (SHA-256) in the refresh_tokens table
 * with a family_id for reuse detection (see M3.4 schema).
 */
import { randomBytes, createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';
import config from '../lib/config';
import logger from '../lib/logger';
import { appendAuditEntry } from './audit.service';

// Access token: 15 minutes
const ACCESS_TOKEN_TTL = '15m';
// Refresh token: 7 days
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_SECONDS * 1000;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

// ── Private helper: persist a new refresh token in a given family ─────────
async function issueRefreshToken(userId: string, familyId: string): Promise<string> {
  const rawToken = randomBytes(40).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await pool.query(
    `INSERT INTO refresh_tokens
       (user_id, token_hash, family_id, revoked, expires_at)
     VALUES ($1, $2, $3, false, $4)`,
    [userId, tokenHash, familyId, expiresAt]
  );

  return rawToken;
}

// ── issueSession ───────────────────────────────────────────────────────────
// Creates a brand-new session (new family_id). Called after login (M4.5).
export async function issueSession(userId: string): Promise<SessionTokens> {
  // 1. Sign access token (JWT)
  const accessToken = jwt.sign(
    { sub: userId },
    config.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );

  // 2. New family_id for this rotation chain
  const { rows: uuidRow } = await pool.query<{ id: string }>(
    'SELECT gen_random_uuid()::text AS id'
  );
  const familyId = uuidRow[0].id;

  // 3. Persist hashed refresh token
  const refreshToken = await issueRefreshToken(userId, familyId);

  // M6.5 — Audit: record login event (fail-open: does not break login if audit is unavailable)
  appendAuditEntry('login', { userId }).catch((err) =>
    logger.error({ err, userId }, 'audit: failed to log login event')
  );

  return { accessToken, refreshToken };
}

// ── rotateRefreshToken ────────────────────────────────────────────────────
// Called by POST /refresh. Validates the old token, detects reuse,
// revokes the old token, and issues a new pair in the SAME family.
export async function rotateRefreshToken(rawToken: string): Promise<SessionTokens> {
  // 1. Hash the submitted token for DB lookup
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  // 2. Look up the token row
  const { rows } = await pool.query<{
    id: string;
    user_id: string;
    family_id: string;
    revoked: boolean;
    expires_at: Date;
  }>(
    `SELECT id, user_id, family_id, revoked, expires_at
     FROM refresh_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  );

  if (!rows[0]) {
    throw new Error('invalid refresh token');
  }

  const { id, user_id: userId, family_id: familyId, revoked, expires_at: expiresAt } = rows[0];

  // 3. Check expiry
  if (new Date(expiresAt) < new Date()) {
    throw new Error('refresh token expired');
  }

  // 4. Reuse detection — token was already revoked
  if (revoked) {
    // Revoke entire family to invalidate all sessions derived from it
    await pool.query(
      'UPDATE refresh_tokens SET revoked = true WHERE family_id = $1',
      [familyId]
    );
    throw new Error('token reuse detected — session family revoked');
  }

  // 5. Revoke the consumed token
  await pool.query(
    'UPDATE refresh_tokens SET revoked = true WHERE id = $1',
    [id]
  );

  // 6. Issue new access token + new refresh token in the SAME family
  const accessToken = jwt.sign(
    { sub: userId },
    config.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
  const refreshToken = await issueRefreshToken(userId, familyId);

  return { accessToken, refreshToken };
}
