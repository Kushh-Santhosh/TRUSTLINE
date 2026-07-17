import { Pool } from 'pg';
import config from '../lib/config';

const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[pool] unexpected client error', err);
});

export default pool;
