import { Router, type Request, type Response } from 'express';
import {
  generateRegistrationOptionsForUser,
  verifyRegistration,
  generateLoginOptionsForUser,
} from '../services/webauthn.service';

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

export default router;
