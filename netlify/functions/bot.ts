import { WEBHOOK_SECRET } from '../lib/config.ts';
import { handleUpdate } from '../lib/bot.ts';

// Telegram webhook. Always answers 200 after a valid secret so Telegram never retries in a storm.
export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok');
  if (req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET()) return new Response('forbidden', { status: 403 });
  try {
    await handleUpdate(await req.json());
  } catch (e) {
    console.error('bot error', e);
  }
  return new Response('ok');
};

export const config = { path: '/bot/webhook' };
