import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TgUser } from '../../src/types/index.ts';
import { BOT_TOKEN, isOwnerId } from './config.ts';

export interface AuthedUser {
  user: TgUser;
  isOwner: boolean;
}

// Validates Telegram WebApp initData (HMAC-SHA256, per Telegram docs) and enforces freshness.
export function validateInitData(initData: string, maxAgeSec = 86400): TgUser | null {
  const token = BOT_TOKEN();
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dcs = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const computed = createHmac('sha256', secret).update(dcs).digest('hex');
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user && user.id ? (user as TgUser) : null;
  } catch {
    return null;
  }
}

export function authenticate(req: Request): AuthedUser | null {
  const initData = req.headers.get('x-init-data') || '';
  const user = validateInitData(initData);
  if (!user) return null;
  return { user, isOwner: isOwnerId(user.id) };
}

export const displayName = (u: { first_name?: string; last_name?: string; username?: string }) =>
  [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.username || 'Foydalanuvchi';
