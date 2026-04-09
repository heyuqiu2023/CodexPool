import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT || 3001),
  frontendOrigin: process.env.FRONTEND_ORIGIN || '*',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'codexpool.db'),
  authSecret: process.env.AUTH_SECRET || '', // empty = no auth required (backward compat)
};
