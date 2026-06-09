import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'mysql',
  dbCredentials: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'clipai',
    password: process.env.MYSQL_PASSWORD || 'clipai_pass',
    database: process.env.MYSQL_DATABASE || 'clipai',
  },
});
