import { WEBHOOK_SECRET } from './config.ts';
import { siteUrl } from './ads.ts';

// Starts a Netlify Background Function (runs up to 15 minutes, the caller gets an instant 202).
export async function callBackground(name: string, payload: unknown, originHint = ''): Promise<boolean> {
  const site = (await siteUrl()) || originHint.replace(/\/$/, '');
  if (!site) return false;
  try {
    const res = await fetch(`${site}/.netlify/functions/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runner-secret': WEBHOOK_SECRET() },
      body: JSON.stringify(payload),
    });
    return res.status === 202 || res.ok;
  } catch {
    return false;
  }
}
