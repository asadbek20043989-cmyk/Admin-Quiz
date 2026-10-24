import { getStore } from '@netlify/blobs';

const store = () => getStore({ name: 'quizbot', consistency: 'strong' });

export async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const v = await store().get(key, { type: 'json' });
    return (v as T) ?? null;
  } catch {
    return null;
  }
}
export async function setJSON(key: string, value: unknown): Promise<void> {
  await store().setJSON(key, value);
}
export async function setText(key: string, value: string): Promise<void> {
  await store().set(key, value);
}
export async function getText(key: string): Promise<string | null> {
  try {
    return (await store().get(key, { type: 'text' })) ?? null;
  } catch {
    return null;
  }
}
export async function del(key: string): Promise<void> {
  try {
    await store().delete(key);
  } catch {
    /* ignore */
  }
}
export async function listKeys(prefix: string): Promise<string[]> {
  const out: string[] = [];
  for await (const page of store().list({ prefix, paginate: true })) {
    for (const b of page.blobs) out.push(b.key);
  }
  return out;
}

// ---- Domain helpers -------------------------------------------------------
import type { GroupRecord, QuizRecord, QuizSummary, AuditLogRecord } from '../../src/types/index.ts';
import { uid } from './config.ts';

// Guruh supergroup'ga ko'chganda eski chat id yangisiga yo'naltiriladi (`mig/<eski>` = yangi id).
export async function getGroup(id: string): Promise<GroupRecord | null> {
  const g = await getJSON<GroupRecord>(`g/${id}`);
  if (g) return g;
  const moved = await getText(`mig/${id}`);
  return moved && moved !== id ? getJSON<GroupRecord>(`g/${moved}`) : null;
}
export const saveGroup = (g: GroupRecord) => setJSON(`g/${g.id}`, g);
export const getQuiz = (id: string) => getJSON<QuizRecord>(`q/${id}`);
export const saveQuiz = (q: QuizRecord) => setJSON(`q/${q.id}`, q);

export async function listAllGroups(): Promise<GroupRecord[]> {
  const keys = await listKeys('g/');
  const all = await Promise.all(keys.map(k => getJSON<GroupRecord>(k)));
  return all.filter(Boolean) as GroupRecord[];
}

// Foydalanuvchi kira oladigan guruhlar (guruh admini yoki yordamchi admin sifatida).
// Huquqi qolmagan (masalan, guruh boshqa adminga qayta ulangan yoki yordamchi olib tashlangan) guruhlar chiqarib tashlanadi.
export async function groupsOfAdmin(userId: string): Promise<GroupRecord[]> {
  const ids = (await getJSON<string[]>(`ug/${userId}`)) || [];
  const all = await Promise.all(ids.map(getGroup));
  const seen = new Set<string>();
  return (all.filter(Boolean) as GroupRecord[]).filter(g => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return g.adminId === userId || !!g.helpers?.some(h => h.userId === userId);
  });
}
export async function addGroupToAdmin(userId: string, groupId: string) {
  const ids = (await getJSON<string[]>(`ug/${userId}`)) || [];
  if (!ids.includes(groupId)) await setJSON(`ug/${userId}`, [...ids, groupId]);
}
export async function removeGroupFromUser(userId: string, groupId: string) {
  const ids = (await getJSON<string[]>(`ug/${userId}`)) || [];
  if (ids.includes(groupId)) await setJSON(`ug/${userId}`, ids.filter(i => i !== groupId));
}

export function summarize(q: QuizRecord): QuizSummary {
  return {
    id: q.id,
    topic: q.topic,
    difficulty: q.difficulty,
    questionCount: q.questions.length,
    status: q.status,
    createdAt: q.createdAt,
    scheduledAt: q.scheduledAt,
    finishedAt: q.finishedAt,
    participantCount: q.participantCount,
  };
}
export async function upsertSummary(q: QuizRecord) {
  const list = (await getJSON<QuizSummary[]>(`gq/${q.groupId}`)) || [];
  const next = [summarize(q), ...list.filter(s => s.id !== q.id)].slice(0, 60);
  await setJSON(`gq/${q.groupId}`, next);
}
export async function removeSummary(groupId: string, quizId: string) {
  const list = (await getJSON<QuizSummary[]>(`gq/${groupId}`)) || [];
  await setJSON(`gq/${groupId}`, list.filter(s => s.id !== quizId));
}

// Small index of quizzes that need time-based attention (scheduled / running).
export interface ActiveIndex {
  scheduled: { id: string; at: number }[];
  running: { id: string; nextAt: number }[];
}
export async function getIndex(): Promise<ActiveIndex> {
  return (await getJSON<ActiveIndex>('idx/active')) || { scheduled: [], running: [] };
}
export async function updateIndex(q: QuizRecord) {
  const idx = await getIndex();
  idx.scheduled = idx.scheduled.filter(s => s.id !== q.id);
  idx.running = idx.running.filter(s => s.id !== q.id);
  if (q.status === 'scheduled' && q.scheduledAt) idx.scheduled.push({ id: q.id, at: new Date(q.scheduledAt).getTime() });
  if (q.status === 'running' && q.nextAt) idx.running.push({ id: q.id, nextAt: q.nextAt });
  await setJSON('idx/active', idx);
}

export async function audit(actor: string, action: string, details: string, groupId?: string) {
  const list = (await getJSON<AuditLogRecord[]>('audit')) || [];
  list.unshift({ id: uid('log'), timestamp: new Date().toISOString(), actor, action, details, groupId });
  await setJSON('audit', list.slice(0, 300));
}
