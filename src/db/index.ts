import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { config } from '../config';
import * as schema from './schema';

const pool = mysql.createPool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4',
  // MySQL 8.0: 允许公钥检索 + 宽松 SSL
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema, mode: 'default' });
export { schema };
