import { Pool } from 'pg';
import config from '../lib/config';
import logger from '../lib/logger';

const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

pool.on('error', (err) => {
  logger.error({ err }, '[pool] unexpected client error');
});

export default pool;
