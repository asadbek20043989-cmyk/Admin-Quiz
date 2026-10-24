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

async function sendAd(ad: AdRecord, g: GroupRecord): Promise<boolean> {
  const site = await siteUrl();
  const text = `📢 <b>Hamkor reklama</b>\n\n<b>${esc(ad.title)}</b>\n${esc(ad.text)}`;
  const markup =
    ad.buttonText && ad.buttonUrl
      ? { reply_markup: { inline_keyboard: [[{ text: ad.buttonText, url: site ? `${site}/r/${ad.id}/${encodeURIComponent(g.id)}` : ad.buttonUrl }]] } }
      : {};
  const r = ad.imageUrl
    ? await tg('sendPhoto', { chat_id: g.tgChatId, photo: ad.imageUrl, caption: text.slice(0, 1000), parse_mode: 'HTML', ...markup })
    : await sendMessage(g.tgChatId, text, markup);
  return !!r.ok;
}

// Reklama FAQAT Super Admin belgilagan guruhlarga yuboriladi (targetGroupIds bo'sh bo'lsa — barcha guruhlarga).
// Quiz tugagach, guruhning haftalik chastotasiga rioya qilgan holda ko'pi bilan bitta reklama chiqadi.
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
  if (!(await sendAd(ad, g))) return false;

  ad.impressions += 1;
  await saveAds(ads);
  g.adLog = [...log, new Date().toISOString()];
  g.lastAdAt = new Date().toISOString();
  return true;
}

// Super Admin tanlagan guruhlarga reklamani darhol yuborish (haftalik limit hisobga olinmaydi).
export async function sendAdNow(adId: string, groups: GroupRecord[]): Promise<{ sent: number; failed: string[] }> {
  const ads = await getAds();
  const ad = ads.find(a => a.id === adId);
  if (!ad) return { sent: 0, failed: ['Reklama topilmadi'] };
  let sent = 0;
  const failed: string[] = [];
  for (const g of groups) {
    if (g.status !== 'active') {
      failed.push(g.title);
      continue;
    }
    if (await sendAd(ad, g)) {
      sent++;
      ad.impressions += 1;
    } else failed.push(g.title);
  }
  await saveAds(ads);
  return { sent, failed };
}
