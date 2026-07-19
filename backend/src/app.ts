import express from 'express';
import cors, { type CorsOptions } from 'cors';
import pinoHttp from 'pino-http';
import pool from './db/pool';
import logger from './lib/logger';
import config from './lib/config';
import { errorHandler } from './middleware/errorHandler';
import authRouter from './routes/auth.routes';
import approvalRouter from './routes/approval.routes';
import ledgerRouter from './routes/ledger.routes';

const app = express();

app.use(pinoHttp({ logger }));
app.use(express.json());

const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || config.FRONTEND_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
};

app.use(cors(corsOptions));

// Health check — returns { status: 'ok', db: 'ok' } when healthy,
// or { status: 'ok', db: 'error', dbError: '...' } when DB is unreachable.
app.get('/health', async (_req, res) => {
  let db: 'ok' | 'error' = 'ok';
  let dbError: string | undefined;

  try {
    await pool.query('SELECT 1');
  } catch (err) {
    db = 'error';
    dbError = err instanceof Error ? err.message : String(err);
  }

  res.json({ status: 'ok', db, ...(dbError ? { dbError } : {}) });
});

app.use('/api/auth', authRouter);
app.use('/api/approval', approvalRouter);
app.use('/api/ledger', ledgerRouter);

app.use(errorHandler);

export default app;
