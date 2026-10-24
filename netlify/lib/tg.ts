import { BOT_TOKEN } from './config.ts';

export interface TgResult<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export async function tg<T = any>(method: string, params: Record<string, unknown> = {}, retry = true): Promise<TgResult<T>> {
  const token = BOT_TOKEN();
  if (!token) return { ok: false, description: 'BOT_TOKEN sozlanmagan' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = (await res.json()) as TgResult<T>;
    if (!data.ok && data.error_code === 429 && retry) {
      const wait = Math.min((data.parameters?.retry_after || 1) * 1000, 4000);
      await new Promise(r => setTimeout(r, wait));
      return tg<T>(method, params, false);
    }
    return data;
  } catch (e: any) {
    return { ok: false, description: e?.message || 'Tarmoq xatosi' };
  }
}

export const sendMessage = (chat_id: string | number, text: string, extra: Record<string, unknown> = {}) =>
  tg('sendMessage', { chat_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

let cachedUsername = '';
export async function botUsername(): Promise<string> {
  if (cachedUsername) return cachedUsername;
  const r = await tg<{ username: string }>('getMe');
  cachedUsername = r.result?.username || '';
  return cachedUsername;
}

export async function botId(): Promise<number> {
  const id = Number((BOT_TOKEN() || '').split(':')[0]);
  return Number.isFinite(id) ? id : 0;
}

export const isChatAdmin = async (chatId: string | number, userId: string | number) => {
  const r = await tg<{ status: string }>('getChatMember', { chat_id: chatId, user_id: Number(userId) });
  return !!r.ok && (r.result?.status === 'creator' || r.result?.status === 'administrator');
};
