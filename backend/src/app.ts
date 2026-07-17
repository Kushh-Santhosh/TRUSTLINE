import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import logger from './lib/logger';
import config from './lib/config';
import { errorHandler } from './middleware/errorHandler';
import authRouter from './routes/auth.routes';
import approvalRouter from './routes/approval.routes';
import ledgerRouter from './routes/ledger.routes';
import riskRouter from './routes/risk.routes';

const app = express();

// Request logging — must be first
app.use(pinoHttp({ logger }));

// Body parsing
app.use(express.json());

// CORS — allow frontend origin from validated config
app.use(cors({ origin: config.FRONTEND_ORIGIN, credentials: true }));

// Health check — do not remove
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// API routers
app.use('/api/auth', authRouter);
app.use('/api/approval', approvalRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/risk', riskRouter);

// Centralized error handler — must be last
app.use(errorHandler);

export default app;
