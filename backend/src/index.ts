import config from './lib/config'; // must be first — loads and validates env
import app from './app';
import logger from './lib/logger';

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'TrustLine API listening');
});
