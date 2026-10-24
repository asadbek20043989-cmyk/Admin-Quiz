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
      minScore: 1,
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

// Move a group record when Telegram migrates a group to a supergroup (chat id changes).
export async function migrateGroup(oldId: string, newId: string) {
  const g = await getGroup(oldId);
  if (!g) return;
  const moved = { ...g, id: newId, tgChatId: newId };
  await saveGroup(moved);
  const { getJSON, setJSON, del } = await import('./db.ts');
  const ids = (await getJSON<string[]>(`ug/${g.adminId}`)) || [];
  await setJSON(`ug/${g.adminId}`, ids.map(i => (i === oldId ? newId : i)));
  const quizzes = await getJSON<any[]>(`gq/${oldId}`);
  if (quizzes) await setJSON(`gq/${newId}`, quizzes);
  await del(`g/${oldId}`);
}
