import type { GroupRecord, QuizRecord } from '../../src/types/index.ts';
import { getGroup, getIndex, getQuiz, saveGroup, saveQuiz, setJSON, upsertSummary } from './db.ts';
import { generateVerified, pickTopic } from './ai.ts';
import { callBackground } from './bg.ts';
import { sendMessage } from './tg.ts';
import { esc, uid } from './config.ts';
import { startQuiz } from './quizEngine.ts';

const TZ_OFFSET_MS = 5 * 3600 * 1000; // Asia/Tashkent

// Earliest "HH:MM" (Tashkent) strictly after `afterMs`, looking at today and tomorrow.
export function nextAutoRun(times: string[], afterMs: number): number | null {
  const valid = times.filter(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
  if (!valid.length) return null;
  const t = new Date(afterMs + TZ_OFFSET_MS);
  const y = t.getUTCFullYear(), m = t.getUTCMonth(), d = t.getUTCDate();
  const cands: number[] = [];
  for (const day of [0, 1]) {
    for (const hm of valid) {
      const [h, mi] = hm.split(':').map(Number);
      const ms = Date.UTC(y, m, d + day, h, mi) - TZ_OFFSET_MS;
      if (ms > afterMs) cands.push(ms);
    }
  }
  return cands.length ? Math.min(...cands) : null;
}

// Keeps the one-entry-per-group "next automatic run" list in the small shared index.
export async function syncAutoIndex(g: GroupRecord) {
  const idx = await getIndex();
  idx.auto = (idx.auto || []).filter(a => a.gid !== g.id);
  if (g.status === 'active' && g.auto?.enabled) {
    const at = nextAutoRun(g.auto.times, Date.now());
    if (at) idx.auto.push({ gid: g.id, at });
  }
  await setJSON('idx/active', idx);
}

// Called by the cron for entries that are due: schedule the next run and start the background job.
export async function dispatchAuto(due: { gid: string; at: number }[]) {
  const now = Date.now();
  const fresh = await getIndex();
  const toRun: string[] = [];
  for (const d of due) {
    const g = await getGroup(d.gid);
    fresh.auto = (fresh.auto || []).filter(a => !(a.gid === d.gid && a.at === d.at));
    if (!g || g.status !== 'active' || !g.auto?.enabled) continue;
    const next = nextAutoRun(g.auto.times, now);
    if (next) fresh.auto.push({ gid: g.id, at: next });
    if (now - d.at <= 40 * 60 * 1000) toRun.push(g.id); // skip runs missed by more than 40 minutes
  }
  await setJSON('idx/active', fresh);
  for (const gid of toRun) await callBackground('auto-quiz-background', { gid });
}

// Runs inside a background function: pick a topic from the group name, generate verified
// questions and send the quiz.
export async function runAutoQuiz(gid: string) {
  const g = await getGroup(gid);
  if (!g || g.status !== 'active' || !g.auto?.enabled) return;
  const a = g.auto;
  if (g.runningQuizId) {
    const cur = await getQuiz(g.runningQuizId);
    if (cur?.status === 'running') return; // another quiz is still going: skip this slot
  }
  const warn = (text: string) => sendMessage(g.adminId, `⚠️ «${esc(g.title)}» guruhi uchun avtomatik quiz yuborilmadi: ${esc(text)}`);

  try {
    const topic = a.topicHint.trim() || (await pickTopic(g.title, a.recentTopics));
    const r = await generateVerified({ subject: topic, difficulty: a.difficulty, count: a.questionCount, optionsCount: 4 });
    if (r.questions.length < 3) {
      await warn("yetarli ishonchli savol tuzilmadi.");
      return;
    }
    const quiz: QuizRecord = {
      id: uid('qz'),
      groupId: g.id,
      topic,
      difficulty: a.difficulty,
      questionCount: r.questions.length,
      secondsPerQuestion: a.secondsPerQuestion,
      language: 'uz',
      status: 'draft',
      winnersCount: g.certificateSettings.winnersCount,
      minScore: 1,
      createdAt: new Date().toISOString(),
      createdBy: g.adminId,
      questions: r.questions,
    };
    await saveQuiz(quiz);
    await upsertSummary(quiz);
    const s = await startQuiz(quiz.id);
    if (!s.ok) {
      await warn(s.error || 'yuborib bo\'lmadi');
      return;
    }
    const g2 = await getGroup(g.id);
    if (g2?.auto) {
      g2.auto.recentTopics = [...a.recentTopics, topic].slice(-8);
      await saveGroup(g2);
    }
  } catch (e: any) {
    await warn(e?.message || 'AI xatosi');
  }
}
