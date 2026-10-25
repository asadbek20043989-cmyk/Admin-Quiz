import type { Difficulty, QuestionRecord } from '../../src/types/index.ts';
import { del, getGroup, getJSON, saveGroup, setJSON } from './db.ts';
import { generateVerified } from './ai.ts';
import { uid } from './config.ts';

export interface GenJob {
  id: string;
  groupId: string;
  userId: string;
  status: 'pending' | 'done' | 'error';
  params: { topic: string; difficulty: Difficulty; count: number; optionsCount: number };
  questions?: QuestionRecord[];
  warning?: string;
  error?: string;
  createdAt: string;
}

export async function createGenJob(groupId: string, userId: string, params: GenJob['params']): Promise<GenJob> {
  const job: GenJob = { id: uid('gen'), groupId, userId, status: 'pending', params, createdAt: new Date().toISOString() };
  await setJSON(`gen/${job.id}`, job);
  return job;
}

export const getGenJob = (id: string) => getJSON<GenJob>(`gen/${id}`);
export const deleteGenJob = (id: string) => del(`gen/${id}`);

// Runs inside a background function (no 10-second limit).
export async function runGenJob(jobId: string) {
  const job = await getGenJob(jobId);
  if (!job || job.status !== 'pending') return;
  try {
    const r = await generateVerified({ subject: job.params.topic, difficulty: job.params.difficulty, count: job.params.count, optionsCount: job.params.optionsCount });
    job.status = 'done';
    job.questions = r.questions;
    if (r.questions.length < r.requested) {
      job.warning = `Faqat ${r.questions.length} ta tekshiruvdan o'tgan ishonchli savol tuzildi. Qolganini qo'lda qo'shishingiz yoki qayta generatsiya qilishingiz mumkin.`;
    }
  } catch (e: any) {
    job.status = 'error';
    job.error = e?.message || 'AI xatosi';
    // A failed generation must not use up the daily quota.
    const g = await getGroup(job.groupId);
    if (g) {
      g.plan.aiDailyUsed = Math.max(0, g.plan.aiDailyUsed - 1);
      await saveGroup(g);
    }
  }
  await setJSON(`gen/${job.id}`, job);
}
