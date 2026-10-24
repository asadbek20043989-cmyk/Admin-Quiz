import type { GroupRecord, StatsOverview } from '../../src/types/index.ts';
import { getJSON, setJSON } from './db.ts';
import { tashkentDate } from './config.ts';

export interface GroupStats {
  quizzes: number;
  participantSum: number;
  pctSum: number;
  pctCount: number;
  certs: number;
  topics: Record<string, { answered: number; wrong: number }>;
  hours: Record<string, number>;
  daily: Record<string, { members: number; participants: number }>;
}

const empty = (): GroupStats => ({ quizzes: 0, participantSum: 0, pctSum: 0, pctCount: 0, certs: 0, topics: {}, hours: {}, daily: {} });
export const getStats = async (gid: string) => (await getJSON<GroupStats>(`stats/${gid}`)) || empty();
export const saveStats = (gid: string, s: GroupStats) => setJSON(`stats/${gid}`, s);

function trimDaily(s: GroupStats) {
  const keys = Object.keys(s.daily).sort();
  while (keys.length > 60) delete s.daily[keys.shift()!];
}

export async function snapshotMembers(g: GroupRecord) {
  const s = await getStats(g.id);
  const d = tashkentDate();
  s.daily[d] = { members: g.memberCount, participants: s.daily[d]?.participants || 0 };
  trimDaily(s);
  await saveStats(g.id, s);
}

export async function recordQuizFinished(
  g: GroupRecord,
  p: { topic: string; startHour: number; participants: number; pcts: number[]; answered: number; wrong: number; certs: number }
) {
  const s = await getStats(g.id);
  s.quizzes += 1;
  s.participantSum += p.participants;
  s.pctSum += p.pcts.reduce((a, b) => a + b, 0);
  s.pctCount += p.pcts.length;
  s.certs += p.certs;
  const t = (s.topics[p.topic] ||= { answered: 0, wrong: 0 });
  t.answered += p.answered;
  t.wrong += p.wrong;
  const h = String(p.startHour);
  s.hours[h] = (s.hours[h] || 0) + p.participants;
  const d = tashkentDate();
  s.daily[d] = { members: g.memberCount, participants: (s.daily[d]?.participants || 0) + p.participants };
  trimDaily(s);
  await saveStats(g.id, s);
}

export function toOverview(g: GroupRecord, s: GroupStats): StatsOverview {
  const days = Object.keys(s.daily).sort();
  const last7 = days.slice(-7);
  const weekCut = new Date(Date.now() + 5 * 3600 * 1000 - 7 * 86400 * 1000).toISOString().slice(0, 10);
  const active = days.filter(d => d > weekCut).reduce((a, d) => a + s.daily[d].participants, 0);
  return {
    totalMembers: g.memberCount,
    activeParticipantsLastWeek: active,
    averageScorePercent: s.pctCount ? Math.round((s.pctSum / s.pctCount) * 10) / 10 : 0,
    totalQuizzesConducted: s.quizzes,
    certificatesIssued: s.certs,
    hardestTopics: Object.entries(s.topics)
      .filter(([, v]) => v.answered >= 5)
      .map(([topic, v]) => ({ topic, errorRate: Math.round((v.wrong / v.answered) * 100) }))
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 5),
    bestPostingHours: Object.entries(s.hours)
      .map(([h, n]) => ({ hour: `${h.padStart(2, '0')}:00`, participation: n }))
      .sort((a, b) => b.participation - a.participation)
      .slice(0, 5),
    growthHistory: last7.map(d => ({ date: d.slice(5), members: s.daily[d].members, participants: s.daily[d].participants })),
  };
}
