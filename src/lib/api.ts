import { initData } from './tg';
import type {
  AdRecord, AdminCodeRecord, AuditLogRecord, BotHealth, CertificateTemplate, GroupRecord, GroupView, HelperAdmin, HelperInvite, HelperPerm, MeResponse,
  ModerationLog, PublicCertificate, QuestionRecord, QuizRecord, QuizSummary, StatsOverview,
} from '../types';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Init-Data': initData() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Internet bilan aloqa yo'q. Qayta urinib ko'ring.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Xatolik (${res.status})`, res.status);
  return data as T;
}

export interface QuizDraftInput {
  topic: string;
  difficulty: string;
  secondsPerQuestion: number;
  language: 'uz' | 'en';
  winnersCount: number;
  minScore: number;
  questions: QuestionRecord[];
  mode: 'draft' | 'now' | 'schedule';
  scheduledAt?: string;
}

export interface OwnerOverview {
  groups: number;
  activeGroups: number;
  members: number;
  quizzes: number;
  certs: number;
  aiToday: number;
  botUsername: string;
  webhook: { url: string; pending: number; lastError: string } | null;
  env: { botToken: boolean; gemini: boolean; owners: number; site: string };
}

export const api = {
  // ---- admin
  me: () => request<MeResponse>('/me'),
  templates: () => request<CertificateTemplate[]>('/certificate-templates'),
  health: (gid: string) => request<BotHealth>(`/groups/${encodeURIComponent(gid)}/health`),
  updateSettings: (gid: string, s: unknown) => request<{ group: GroupView }>(`/groups/${encodeURIComponent(gid)}/settings`, 'PATCH', s),
  updateCert: (gid: string, s: unknown) => request<{ group: GroupView }>(`/groups/${encodeURIComponent(gid)}/certificate-settings`, 'PATCH', s),
  stats: (gid: string) => request<StatsOverview>(`/groups/${encodeURIComponent(gid)}/stats`),
  moderation: (gid: string) => request<{ logs: ModerationLog[] }>(`/groups/${encodeURIComponent(gid)}/moderation`),
  welcomeTest: (gid: string) => request(`/groups/${encodeURIComponent(gid)}/welcome-test`, 'POST'),
  helpers: (gid: string) =>
    request<{ helpers: HelperAdmin[]; invites: HelperInvite[]; max: number; botUsername: string }>(`/groups/${encodeURIComponent(gid)}/helpers`),
  helperInvite: (gid: string, perms: HelperPerm[]) =>
    request<{ code: string; link: string }>(`/groups/${encodeURIComponent(gid)}/helpers/invite`, 'POST', { perms }),
  helperRevokeInvite: (gid: string, code: string) => request(`/groups/${encodeURIComponent(gid)}/helpers/invite/${encodeURIComponent(code)}`, 'DELETE'),
  helperAdd: (gid: string, userId: string, perms: HelperPerm[]) => request<{ helpers: HelperAdmin[] }>(`/groups/${encodeURIComponent(gid)}/helpers`, 'POST', { userId, perms }),
  helperPerms: (gid: string, uid: string, perms: HelperPerm[]) =>
    request<{ helpers: HelperAdmin[] }>(`/groups/${encodeURIComponent(gid)}/helpers/${encodeURIComponent(uid)}`, 'PATCH', { perms }),
  helperRemove: (gid: string, uid: string) => request<{ helpers: HelperAdmin[] }>(`/groups/${encodeURIComponent(gid)}/helpers/${encodeURIComponent(uid)}`, 'DELETE'),
  generate: (gid: string, p: { topic: string; difficulty: string; questionCount: number; optionsCount: number; language: string }) =>
    request<{ questions: QuestionRecord[] }>(`/groups/${encodeURIComponent(gid)}/quizzes/generate`, 'POST', p),
  quizzes: (gid: string) => request<QuizSummary[]>(`/groups/${encodeURIComponent(gid)}/quizzes`),
  createQuiz: (gid: string, d: QuizDraftInput) => request<{ quiz: QuizRecord }>(`/groups/${encodeURIComponent(gid)}/quizzes`, 'POST', d),
  quiz: (id: string) => request<QuizRecord>(`/quizzes/${encodeURIComponent(id)}`),
  sendQuiz: (id: string) => request(`/quizzes/${encodeURIComponent(id)}/send`, 'POST'),
  stopQuiz: (id: string) => request(`/quizzes/${encodeURIComponent(id)}/stop`, 'POST'),
  restartQuiz: (id: string, mode: 'now' | 'draft') => request(`/quizzes/${encodeURIComponent(id)}/restart`, 'POST', { mode }),
  deleteQuiz: (id: string) => request(`/quizzes/${encodeURIComponent(id)}`, 'DELETE'),

  // ---- owner (server rejects everyone except SUPER_ADMIN_IDS)
  ownerOverview: () => request<OwnerOverview>('/owner/overview'),
  ownerSetup: () => request<{ username: string }>('/owner/setup', 'POST'),
  ownerGroups: () => request<GroupRecord[]>('/owner/groups'),
  ownerLimits: (gid: string, l: unknown) => request(`/owner/groups/${encodeURIComponent(gid)}/limits`, 'PATCH', l),
  ownerToggle: (gid: string) => request<{ status: string }>(`/owner/groups/${encodeURIComponent(gid)}/toggle`, 'POST'),
  ownerResetStats: (gid: string) => request(`/owner/groups/${encodeURIComponent(gid)}/reset-stats`, 'POST'),
  ownerCodes: () => request<AdminCodeRecord[]>('/owner/codes'),
  ownerCreateCode: (d: unknown) => request<{ code: string; codeRecord: AdminCodeRecord }>('/owner/codes', 'POST', d),
  ownerRevokeCode: (id: string) => request(`/owner/codes/${encodeURIComponent(id)}/revoke`, 'POST'),
  ownerAds: () => request<AdRecord[]>('/owner/ads'),
  ownerCreateAd: (d: unknown) => request<{ ad: AdRecord }>('/owner/ads', 'POST', d),
  ownerToggleAd: (id: string) => request(`/owner/ads/${encodeURIComponent(id)}`, 'PATCH'),
  ownerAdTargets: (id: string, targetGroupIds: string[]) => request(`/owner/ads/${encodeURIComponent(id)}`, 'PATCH', { targetGroupIds }),
  ownerSendAd: (id: string, groupIds: string[]) => request<{ sent: number; failed: string[] }>(`/owner/ads/${encodeURIComponent(id)}/send`, 'POST', { groupIds }),
  ownerDeleteAd: (id: string) => request(`/owner/ads/${encodeURIComponent(id)}`, 'DELETE'),
  ownerAudit: () => request<AuditLogRecord[]>('/owner/audit'),
  ownerBroadcast: (text: string) => request<{ sent: number; total: number }>('/owner/broadcast', 'POST', { text }),

  // ---- public
  certificate: async (q: string, u: string): Promise<PublicCertificate> => {
    const res = await fetch(`/api/cert?q=${encodeURIComponent(q)}&u=${encodeURIComponent(u)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data?.error || 'Sertifikat topilmadi', res.status);
    return data;
  },
};
