import { randomBytes, createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';
import config from '../lib/config';
import logger from '../lib/logger';
import { appendAuditEntry } from './audit.service';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

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

export async function issueSession(
  userId: string,
  ip?: string,
  userAgent?: string
): Promise<SessionTokens> {
  const accessToken = jwt.sign({ sub: userId }, config.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

  const { rows: uuidRow } = await pool.query<{ id: string }>('SELECT gen_random_uuid()::text AS id');
  const familyId = uuidRow[0].id;

  const refreshToken = await issueRefreshToken(userId, familyId);

  // Record login event for risk scoring — fail-open
  pool.query(
    `INSERT INTO login_events (user_id, ip, user_agent) VALUES ($1, $2, $3)`,
    [userId, ip ?? null, userAgent ?? null]
  ).catch((err) => logger.error({ err, userId }, 'login_events: failed to record event'));

  // Audit — fail-open
  appendAuditEntry('login', { userId }).catch((err) =>
    logger.error({ err, userId }, 'audit: failed to log login event')
  );

  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(rawToken: string): Promise<SessionTokens> {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

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

  if (!rows[0]) throw new Error('invalid refresh token');

  const { id, user_id: userId, family_id: familyId, revoked, expires_at: expiresAt } = rows[0];

  if (new Date(expiresAt) < new Date()) throw new Error('refresh token expired');

  if (revoked) {
    await pool.query('UPDATE refresh_tokens SET revoked = true WHERE family_id = $1', [familyId]);
    throw new Error('token reuse detected — session family revoked');
  }

  await pool.query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [id]);

  const accessToken = jwt.sign({ sub: userId }, config.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
  const refreshToken = await issueRefreshToken(userId, familyId);

  return { accessToken, refreshToken };
}
