import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  generateRegistrationOptionsForUser,
  verifyRegistration,
  generateLoginOptionsForUser,
  verifyLogin,
} from '../services/webauthn.service';
import { issueSession, rotateRefreshToken } from '../services/session.service';
import { generateSecretForUser, verifyCode } from '../services/totp.service';
import { scoreLoginRisk } from '../services/risk.service';
import config from '../lib/config';

// Short-lived pending token TTL (5 minutes) — bridges WebAuthn success → TOTP step-up
const STEP_UP_TTL = '5m';
const STEP_UP_PURPOSE = 'step_up' as const;

const router = Router();

// ── POST /api/auth/register/options ───────────────────────────────────────
// Body: { email: string }
// Returns: PublicKeyCredentialCreationOptionsJSON
router.post(
  '/register/options',
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    try {
      const options = await generateRegistrationOptionsForUser(email.trim().toLowerCase());
      res.json(options);
    } catch (err) {
      let message = 'internal error';
      if (err instanceof Error && err.message) {
        message = err.message;
      } else if (err && typeof err === 'object' && 'code' in err) {
        message = String((err as Record<string, unknown>).code);
      }
      res.status(500).json({ error: message });
    }
  }
);

// ── POST /api/auth/register/verify ────────────────────────────────────────
// Body: { email: string, response: RegistrationResponseJSON }
// Returns: { verified: true }
router.post(
  '/register/verify',
  async (req: Request, res: Response): Promise<void> => {
    const { email, response } = req.body as {
      email?: string;
      response?: unknown;
    };

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!response || typeof response !== 'object') {
      res.status(400).json({ error: 'response is required' });
      return;
    }

    try {
      await verifyRegistration(
        email.trim().toLowerCase(),
        response as Parameters<typeof verifyRegistration>[1]
      );
      res.json({ verified: true });
    } catch (err) {
      let message = 'verification failed';
      if (err instanceof Error && err.message) {
        message = err.message;
      }
      const status = message.includes('no pending challenge') ? 400 : 422;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/auth/login/options ──────────────────────────────────────────
// Body: { email: string }
// Returns: PublicKeyCredentialRequestOptionsJSON
router.post(
  '/login/options',
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    try {
      const options = await generateLoginOptionsForUser(email.trim().toLowerCase());
      res.json(options);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'internal error';
      const status = message.includes('no credentials') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/auth/login/verify ──────────────────────────────────────────
// Body: { email: string, response: AuthenticationResponseJSON }
// Low-risk  → 200 { accessToken, refreshToken }
// Medium/high risk → 200 { stepUpRequired: true, method: 'totp', pendingToken: string }
router.post(
  '/login/verify',
  async (req: Request, res: Response): Promise<void> => {
    const { email, response } = req.body as {
      email?: string;
      response?: unknown;
    };

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!response || typeof response !== 'object') {
      res.status(400).json({ error: 'response is required' });
      return;
    }

    const ip = req.ip;
    const userAgent = req.headers['user-agent'] as string | undefined;

    try {
      const userId = await verifyLogin(
        email.trim().toLowerCase(),
        response as Parameters<typeof verifyLogin>[1]
      );

      // M7.3 — Score the login risk before deciding whether to issue tokens
      const { score } = await scoreLoginRisk(userId, ip, userAgent);

      if (score === 'medium' || score === 'high') {
        // Issue a short-lived pending token so the step-up endpoint
        // knows which user completed WebAuthn without exposing userId in plaintext.
        const pendingToken = jwt.sign(
          { sub: userId, purpose: STEP_UP_PURPOSE, ip, userAgent },
          config.JWT_SECRET,
          { expiresIn: STEP_UP_TTL }
        );
        res.json({ stepUpRequired: true, method: 'totp', pendingToken });
        return;
      }

      // Low risk — issue full session immediately
      const tokens = await issueSession(userId, ip, userAgent);
      res.json(tokens);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'verification failed';
      const status = message.includes('no pending') ? 400 : 401;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/auth/login/step-up ──────────────────────────────────────────
// Body: { pendingToken: string, code: string }
// Returns: { accessToken: string, refreshToken: string } on success
// Verifies the TOTP code then issues a full session.
router.post(
  '/login/step-up',
  async (req: Request, res: Response): Promise<void> => {
    const { pendingToken, code } = req.body as {
      pendingToken?: string;
      code?: string;
    };

    if (!pendingToken || typeof pendingToken !== 'string') {
      res.status(400).json({ error: 'pendingToken is required' });
      return;
    }
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    try {
      // 1. Verify the pending token (issued by /login/verify on medium/high risk)
      const decoded = jwt.verify(pendingToken, config.JWT_SECRET) as {
        sub: string;
        purpose: string;
        ip?: string;
        userAgent?: string;
      };

      if (decoded.purpose !== STEP_UP_PURPOSE) {
        res.status(401).json({ error: 'invalid pending token' });
        return;
      }

      const userId = decoded.sub;

      // 2. Verify TOTP code via existing totp.service
      await verifyCode(userId, code);

      // 3. TOTP passed — issue full session
      const tokens = await issueSession(
        userId,
        decoded.ip,
        decoded.userAgent
      );
      res.json(tokens);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'step-up failed';
      const status =
        message.includes('invalid') || message.includes('expired') || message.includes('TOTP')
          ? 401
          : 400;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/auth/totp/setup ──────────────────────────────────────────────
// Body: { userId: string }
// Returns: { secret: string, otpauthUrl: string }
// Note: auth middleware applied in M4.9 — userId accepted directly for now.
router.post(
  '/totp/setup',
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.body as { userId?: string };

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    try {
      const payload = await generateSecretForUser(userId);
      res.json(payload);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'internal error';
      const status = message === 'user not found' ? 404 : 500;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/auth/totp/verify ─────────────────────────────────────────────
// Body: { userId: string, code: string }
// Returns: { enabled: true }
router.post(
  '/totp/verify',
  async (req: Request, res: Response): Promise<void> => {
    const { userId, code } = req.body as { userId?: string; code?: string };

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    try {
      await verifyCode(userId, code.trim());
      res.json({ enabled: true });
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'verification failed';
      const status =
        message === 'user not found' ? 404
        : message.includes('not set up') ? 400
        : message === 'invalid TOTP code' ? 422
        : 500;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/auth/refresh ───────────────────────────────────────────────
// Body: { refreshToken: string }
// Returns: { accessToken: string, refreshToken: string }
// Reuse detected: 401 + full family revoked
router.post(
  '/refresh',
  async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json({ error: 'refreshToken is required' });
      return;
    }

    try {
      const tokens = await rotateRefreshToken(refreshToken);
      res.json(tokens);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'token rotation failed';
      const status =
        message === 'invalid refresh token' ? 401
        : message === 'refresh token expired' ? 401
        : message.includes('reuse detected') ? 401
        : 500;
      res.status(status).json({ error: message });
    }
  }
);

export default router;
