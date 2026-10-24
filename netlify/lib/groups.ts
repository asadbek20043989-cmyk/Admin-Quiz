import type { GroupRecord } from '../../src/types/index.ts';
import { tashkentDate, tashkentMonth } from './config.ts';
import { tg } from './tg.ts';
import { getGroup, saveGroup } from './db.ts';

export function newGroup(p: {
  chatId: string;
  title: string;
  username?: string;
  adminId: string;
  adminName: string;
  memberCount: number;
  plan: { aiDailyQuota: number; certMonthlyQuota: number; adMinPerWeek: number };
}): GroupRecord {
  return {
    id: p.chatId,
    tgChatId: p.chatId,
    title: p.title,
    username: p.username,
    status: 'active',
    timezone: 'Asia/Tashkent',
    memberCount: p.memberCount,
    memberCountAt: new Date().toISOString(),
    settings: {
      autoApproveJoin: false,
      welcomeEnabled: false,
      welcomeMessage: "Assalomu alaykum, {name}! «{group}» guruhiga xush kelibsiz.",
      rules: '',
      antiSpamEnabled: false,
      filterLinks: true,
      filterForwards: false,
      bannedWords: [],
      explainEnabled: true,
      adFrequencyPerWeek: p.plan.adMinPerWeek,
      adFree: false,
    },
    plan: {
      aiDailyQuota: p.plan.aiDailyQuota,
      aiDailyUsed: 0,
      aiDailyDate: tashkentDate(),
      certMonthlyQuota: p.plan.certMonthlyQuota,
      certMonthlyUsed: 0,
      certMonthKey: tashkentMonth(),
      adMinPerWeek: p.plan.adMinPerWeek,
      adMaxPerWeek: Math.max(p.plan.adMinPerWeek + 3, 5),
    },
    certificateSettings: {
      templateId: 'tmpl-modern-gold',
      winnersCount: 3,
      minScore: 3,
      signatoryTitle: 'Guruh Admini',
      signatoryName: p.adminName,
    },
    linkedAt: new Date().toISOString(),
    adminId: p.adminId,
    adminName: p.adminName,
  };
}

// Resets daily/monthly counters when the period changed. Returns true if modified.
export function rollQuotas(g: GroupRecord): boolean {
  let changed = false;
  const d = tashkentDate();
  const m = tashkentMonth();
  if (g.plan.aiDailyDate !== d) {
    g.plan.aiDailyDate = d;
    g.plan.aiDailyUsed = 0;
    changed = true;
  }
  if (g.plan.certMonthKey !== m) {
    g.plan.certMonthKey = m;
    g.plan.certMonthlyUsed = 0;
    changed = true;
  }
  return changed;
}

// Refreshes member count at most once per hour.
export async function refreshMemberCount(g: GroupRecord): Promise<void> {
  const last = g.memberCountAt ? new Date(g.memberCountAt).getTime() : 0;
  if (Date.now() - last < 3600 * 1000) return;
  const r = await tg<number>('getChatMemberCount', { chat_id: g.tgChatId });
  if (r.ok && typeof r.result === 'number') {
    g.memberCount = r.result;
    g.memberCountAt = new Date().toISOString();
  }
}

// Telegram guruhni supergroup'ga o'tkazganda chat id o'zgaradi. Guruh, uning quizlari, adminlari
// (yordamchilar ham) va statistikasi yangi id ostiga ko'chiriladi, eski id esa yangisiga yo'naltiriladi.
export async function migrateGroup(oldId: string, newId: string) {
  const { getJSON, setJSON, setText, del } = await import('./db.ts');
  const g = await getGroup(oldId);
  if (!g) return;
  const moved = { ...g, id: newId, tgChatId: newId };
  await saveGroup(moved);
  await setText(`mig/${oldId}`, newId);

  const members = [g.adminId, ...(g.helpers || []).map(h => h.userId)];
  for (const uid of new Set(members)) {
    const ids = (await getJSON<string[]>(`ug/${uid}`)) || [];
    await setJSON(`ug/${uid}`, [...new Set(ids.map(i => (i === oldId ? newId : i)))]);
  }

  const summaries = await getJSON<any[]>(`gq/${oldId}`);
  if (summaries) {
    await setJSON(`gq/${newId}`, summaries);
    for (const sm of summaries) {
      const q = await getJSON<any>(`q/${sm.id}`);
      if (q && q.groupId === oldId) await setJSON(`q/${q.id}`, { ...q, groupId: newId });
    }
  }
  const stats = await getJSON<any>(`stats/${oldId}`);
  if (stats) await setJSON(`stats/${newId}`, stats);
  await del(`g/${oldId}`);
}
