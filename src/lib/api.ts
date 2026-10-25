import { initData } from './tg';
import type {
  HelperInviteRecord, HelperPerms, HelperRecord, AdRecord, AdminCodeRecord, AuditLogRecord, BotHealth, CertificateTemplate, GroupRecord, MeResponse, ModerationLog, PublicCertificate,
  QuestionRecord, QuizRecord, QuizSummary, StatsOverview,
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
  updateSettings: (gid: string, s: unknown) => request<{ group: GroupRecord }>(`/groups/${encodeURIComponent(gid)}/settings`, 'PATCH', s),
  updateCert: (gid: string, s: unknown) => request<{ group: GroupRecord }>(`/groups/${encodeURIComponent(gid)}/certificate-settings`, 'PATCH', s),
  stats: (gid: string) => request<StatsOverview>(`/groups/${encodeURIComponent(gid)}/stats`),
  moderation: (gid: string) => request<{ logs: ModerationLog[] }>(`/groups/${encodeURIComponent(gid)}/moderation`),
  // AI generation runs as a background job (it also verifies every question); we poll for the result.
  generate: async (gid: string, p: { topic: string; difficulty: string; questionCount: number; optionsCount: number }) => {
    const { jobId } = await request<{ jobId: string }>(`/groups/${encodeURIComponent(gid)}/quizzes/generate`, 'POST', p);
    const started = Date.now();
    let delay = 2500;
    while (Date.now() - started < 340000) {
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay + 500, 5000);
      const r = await request<{ status: 'pending' | 'done' | 'error'; questions?: QuestionRecord[]; warning?: string; error?: string }>(
        `/groups/${encodeURIComponent(gid)}/quizzes/generate/${encodeURIComponent(jobId)}`
      );
      if (r.status === 'done') return { questions: r.questions || [], warning: r.warning };
      if (r.status === 'error') throw new ApiError(r.error || 'AI xatosi', 502);
    }
    throw new ApiError("AI javob bermadi. Qayta urinib ko'ring.", 504);
  },
  saveAuto: (gid: string, a: unknown) => request<{ group: GroupRecord }>(`/groups/${encodeURIComponent(gid)}/auto`, 'PATCH', a),
  helpers: (gid: string) => request<{ helpers: HelperRecord[]; invites: HelperInviteRecord[]; limit: number }>(`/groups/${encodeURIComponent(gid)}/helpers`),
  createInvite: (gid: string, d: { label: string; perms: HelperPerms }) =>
    request<{ code: string; link: string; invite: HelperInviteRecord }>(`/groups/${encodeURIComponent(gid)}/helpers/invite`, 'POST', d),
  deleteInvite: (gid: string, id: string) => request(`/groups/${encodeURIComponent(gid)}/helpers/invites/${encodeURIComponent(id)}`, 'DELETE'),
  setHelperPerms: (gid: string, userId: string, perms: HelperPerms) => request(`/groups/${encodeURIComponent(gid)}/helpers/${encodeURIComponent(userId)}`, 'PATCH', { perms }),
  removeHelper: (gid: string, userId: string) => request(`/groups/${encodeURIComponent(gid)}/helpers/${encodeURIComponent(userId)}`, 'DELETE'),
  quizzes: (gid: string) => request<QuizSummary[]>(`/groups/${encodeURIComponent(gid)}/quizzes`),
  createQuiz: (gid: string, d: QuizDraftInput) => request<{ quiz: QuizRecord }>(`/groups/${encodeURIComponent(gid)}/quizzes`, 'POST', d),
  quiz: (id: string) => request<QuizRecord>(`/quizzes/${encodeURIComponent(id)}`),
  sendQuiz: (id: string) => request(`/quizzes/${encodeURIComponent(id)}/send`, 'POST'),
  restartQuiz: (id: string) => request<{ id: string }>(`/quizzes/${encodeURIComponent(id)}/restart`, 'POST'),
  stopQuiz: (id: string) => request(`/quizzes/${encodeURIComponent(id)}/stop`, 'POST'),
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
  ownerSendAd: (id: string, groupIds: string[] | 'all', at?: string) =>
    request<{ sent?: number; total?: number; scheduled?: boolean }>(`/owner/ads/${encodeURIComponent(id)}/send`, 'POST', { groupIds, at }),
  ownerToggleAd: (id: string) => request(`/owner/ads/${encodeURIComponent(id)}`, 'PATCH'),
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
