import { createHash } from 'node:crypto';

export const BOT_TOKEN = () => process.env.BOT_TOKEN || '';
export const SUPER_ADMIN_IDS = (): string[] =>
  (process.env.SUPER_ADMIN_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
export const isOwnerId = (id: string | number) => SUPER_ADMIN_IDS().includes(String(id));

// Secret sent by Telegram in X-Telegram-Bot-Api-Secret-Token. Derived from the bot token
// unless WEBHOOK_SECRET is set explicitly (A-Z a-z 0-9 _ - only).
export const WEBHOOK_SECRET = () =>
  process.env.WEBHOOK_SECRET ||
  createHash('sha256').update('qb-webhook:' + BOT_TOKEN()).digest('hex').slice(0, 48);

export const CODE_PEPPER = () => createHash('sha256').update('qb-code:' + BOT_TOKEN()).digest('hex');

export const GEMINI_KEY = () => process.env.GEMINI_API_KEY || '';
export const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Asia/Tashkent is UTC+5 with no DST.
const TZ_OFFSET_MS = 5 * 3600 * 1000;
export const tashkentDate = (d = new Date()) => new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
export const tashkentMonth = (d = new Date()) => tashkentDate(d).slice(0, 7);
export const tashkentHour = (d = new Date()) => new Date(d.getTime() + TZ_OFFSET_MS).getUTCHours();

export const MONTHS_UZ = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
export const formatDateUz = (d = new Date()) => {
  const t = new Date(d.getTime() + TZ_OFFSET_MS);
  return `${t.getUTCDate()}-${MONTHS_UZ[t.getUTCMonth()]}, ${t.getUTCFullYear()}`;
};

export const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
