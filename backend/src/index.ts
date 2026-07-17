import config from './lib/config'; // must be first — loads and validates env
import app from './app';
import logger from './lib/logger';
import { runEscalationCheck } from './jobs/escalation.job';

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'TrustLine API listening');

  // M5.6 — Escalation job: check every 30 seconds for stalled pending requests
  setInterval(runEscalationCheck, 30_000);
  logger.info('escalation job registered (interval: 30s)');
});
