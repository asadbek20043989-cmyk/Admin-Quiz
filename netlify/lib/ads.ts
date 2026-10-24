import type { AdRecord, GroupRecord } from '../../src/types/index.ts';
import { getJSON, setJSON, getText } from './db.ts';
import { sendMessage, tg } from './tg.ts';
import { esc } from './config.ts';

export const getAds = async () => (await getJSON<AdRecord[]>('ads')) || [];
export const saveAds = (a: AdRecord[]) => setJSON('ads', a);

export async function siteUrl(): Promise<string> {
  const env = (process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '');
  if (env) return env;
  return ((await getText('cfg/site')) || '').replace(/\/$/, '');
}

// Posts at most one clearly-labelled partner ad, honoring the group's weekly frequency.
export async function maybePostAd(g: GroupRecord): Promise<boolean> {
  if (g.settings.adFree) return false;
  const weekAgo = Date.now() - 7 * 86400 * 1000;
  const log = (g.adLog || []).filter(t => new Date(t).getTime() > weekAgo);
  const freq = Math.min(Math.max(g.settings.adFrequencyPerWeek, g.plan.adMinPerWeek), g.plan.adMaxPerWeek);
  if (log.length >= freq) return false;
  if (g.lastAdAt && Date.now() - new Date(g.lastAdAt).getTime() < 20 * 3600 * 1000) return false;

  const ads = await getAds();
  const cands = ads
    .filter(a => a.status === 'active' && (a.targetGroupIds.length === 0 || a.targetGroupIds.includes(g.id)))
    .sort((a, b) => a.impressions - b.impressions);
  const ad = cands[0];
  if (!ad) return false;

  const ok = await postAd(ad, g);
  if (!ok) return false;

  ad.impressions += 1;
  await saveAds(ads);
  g.adLog = [...log, new Date().toISOString()];
  g.lastAdAt = new Date().toISOString();
  return true;
}

// Sends exactly the ad text (optionally with a photo and a button) - no labels or extra wording.
export async function postAd(ad: AdRecord, g: GroupRecord): Promise<boolean> {
  const text = esc(ad.text);
  const markup =
    ad.buttonText && ad.buttonUrl ? { reply_markup: { inline_keyboard: [[{ text: ad.buttonText, url: ad.buttonUrl }]] } } : {};
  const r = ad.imageUrl
    ? await tg('sendPhoto', { chat_id: g.tgChatId, photo: ad.imageUrl, caption: text.slice(0, 1000), parse_mode: 'HTML', ...markup })
    : await sendMessage(g.tgChatId, text, markup);
  return !!r.ok;
}

// Owner-triggered send: ignores the weekly frequency limits. Returns how many groups received it.
export async function sendAdToGroups(adId: string, groupIds: string[] | 'all'): Promise<{ sent: number; total: number }> {
  const { listAllGroups, getGroup } = await import('./db.ts');
  const ads = await getAds();
  const ad = ads.find(a => a.id === adId);
  if (!ad) return { sent: 0, total: 0 };
  const groups = (groupIds === 'all' ? await listAllGroups() : (await Promise.all(groupIds.map(getGroup))).filter(Boolean)) as GroupRecord[];
  const targets = groups.filter(g => g.status === 'active');
  let sent = 0;
  for (const g of targets) {
    if (await postAd(ad, g)) sent++;
  }
  if (sent) {
    ad.impressions += sent;
    await saveAds(ads);
  }
  return { sent, total: targets.length };
}
