import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try { process.loadEnvFile(path.join(root, '.env')); } catch { /* .env не обов'язковий */ }

const env = process.env;
const dataDir = path.resolve(root, env.DATA_DIR || 'data');

export const config = {
  root,
  port: Number(env.PORT || 3000),
  host: env.HOST || '',
  publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
  trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
  dataDir,
  dbFile: path.join(dataDir, 'wave.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  audioDir: path.join(dataDir, 'uploads', 'audio'),
  photoDir: path.join(dataDir, 'uploads', 'photos'),
  maxAudioBytes: Number(env.MAX_AUDIO_MB || 400) * 1024 * 1024,
  maxPhotoBytes: Number(env.MAX_PHOTO_MB || 25) * 1024 * 1024,
  admin: {
    user: env.ADMIN_USER || 'admin',
    password: env.ADMIN_PASSWORD || '',
  },
  google: {
    serviceAccountFile: env.GOOGLE_SERVICE_ACCOUNT_FILE || '',
    serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
    calendarId: env.GOOGLE_CALENDAR_ID || '',
    apiBase: (env.GOOGLE_API_BASE || 'https://www.googleapis.com/calendar/v3').replace(/\/+$/, ''),
    tokenUrl: env.GOOGLE_TOKEN_URL || '',
    pollSeconds: Number(env.GOOGLE_POLL_SECONDS || 60),
  },
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN || '',
    chatId: env.TELEGRAM_CHAT_ID || '',
  },
  isProd: env.NODE_ENV === 'production',
  staticSite: env.WR_STATIC === '1',
  tz: 'Europe/Kyiv',
};

for (const dir of [config.dataDir, config.audioDir, config.photoDir]) {
  fs.mkdirSync(dir, { recursive: true });
}
