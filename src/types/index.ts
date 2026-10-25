// Shared types (used by both the Mini App frontend and Netlify Functions).

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface GroupSettings {
  autoApproveJoin: boolean;
  welcomeEnabled: boolean;
  welcomeMessage: string;
  rules: string;
  antiSpamEnabled: boolean;
  filterLinks: boolean;
  filterForwards: boolean;
  bannedWords: string[];
  explainEnabled: boolean;
  adFrequencyPerWeek: number;
  adFree: boolean;
}

export interface HelperPerms {
  create: boolean; // generate, create, send and replay quizzes
  control: boolean; // stop and delete quizzes
  stats: boolean;
  moderation: boolean;
  settings: boolean; // welcome message, rules, certificate settings
  auto: boolean; // automatic daily quizzes
}

export interface HelperRecord {
  userId: string;
  name: string;
  username?: string;
  perms: HelperPerms;
  addedAt: string;
}

export interface HelperInviteRecord {
  id: string;
  label: string;
  perms: HelperPerms;
  expiresAt: string;
  hash?: string; // never sent to clients
}

export interface AutoQuizSettings {
  enabled: boolean;
  times: string[]; // "HH:MM" in Asia/Tashkent
  questionCount: number;
  secondsPerQuestion: number;
  difficulty: 'easy' | 'medium' | 'hard';
  topicHint: string; // optional; empty = decide from the group name
  recentTopics: string[];
}

export interface GroupPlan {
  autoDailyMax: number; // max automatic quizzes per day (set by the Super Admin)
  aiDailyQuota: number;
  aiDailyUsed: number;
  aiDailyDate: string; // YYYY-MM-DD (Asia/Tashkent)
  certMonthlyQuota: number;
  certMonthlyUsed: number;
  certMonthKey: string; // YYYY-MM
  adMinPerWeek: number;
  adMaxPerWeek: number;
}

export interface CertificateSettings {
  templateId: string;
  winnersCount: number;
  minScore: number;
  signatoryTitle: string;
  signatoryName: string;
}

export interface GroupRecord {
  id: string; // = Telegram chat id as string
  tgChatId: string;
  title: string;
  username?: string;
  status: 'active' | 'inactive' | 'suspended';
  timezone: string;
  memberCount: number;
  memberCountAt?: string;
  settings: GroupSettings;
  plan: GroupPlan;
  certificateSettings: CertificateSettings;
  linkedAt: string;
  adminId: string;
  adminName: string;
  adminCheckedAt?: string;
  runningQuizId?: string;
  lastAdAt?: string;
  adLog?: string[];
  helpers?: HelperRecord[];
  invites?: HelperInviteRecord[];
  auto?: AutoQuizSettings;
}

export interface QuestionRecord {
  id: string;
  position: number;
  text: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  verified: boolean;
}

export interface ParticipantResult {
  userId: string;
  name: string;
  username?: string;
  score: number;
  correctCount: number;
  totalTimeSeconds: number;
  rank: number;
  certificateIssued: boolean;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface QuizRecord {
  id: string;
  groupId: string;
  topic: string;
  difficulty: Difficulty;
  questionCount: number;
  secondsPerQuestion: number;
  language: 'uz' | 'en';
  status: 'draft' | 'scheduled' | 'running' | 'finished' | 'cancelled';
  scheduledAt?: string;
  winnersCount: number;
  minScore: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  createdBy: string;
  questions: QuestionRecord[];
  results?: ParticipantResult[];
  participantCount?: number;
  // runtime state
  cursor?: number;
  nextAt?: number;
  qSentAt?: number[];
  pollIds?: string[];
  messageIds?: number[];
  runner?: string;
}

export interface QuizSummary {
  id: string;
  topic: string;
  difficulty: Difficulty;
  questionCount: number;
  status: QuizRecord['status'];
  createdAt: string;
  scheduledAt?: string;
  finishedAt?: string;
  participantCount?: number;
}

export interface CertificateTemplate {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
}

export interface AdminCodeRecord {
  id: string;
  hint: string; // masked code, e.g. QZ-••••-9XMA
  groupTitle: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  usedBy?: string;
  usedAt?: string;
  revoked: boolean;
  plan: { aiDailyQuota: number; certMonthlyQuota: number; adMinPerWeek: number };
}

export interface AdRecord {
  id: string;
  title: string;
  text: string;
  imageUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
  targetGroupIds: string[]; // empty = all groups
  status: 'active' | 'paused';
  impressions: number;
  clicks: number;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details: string;
  groupId?: string;
}

export interface ModerationLog {
  id: string;
  userId: string;
  userName: string;
  action: 'ogohlantirish' | 'mute' | 'ban' | 'spam_tozalandi';
  reason: string;
  timestamp: string;
}

export interface StatsOverview {
  totalMembers: number;
  activeParticipantsLastWeek: number;
  averageScorePercent: number;
  totalQuizzesConducted: number;
  certificatesIssued: number;
  hardestTopics: { topic: string; errorRate: number }[];
  bestPostingHours: { hour: string; participation: number }[];
  growthHistory: { date: string; members: number; participants: number }[];
}

export interface BotHealth {
  botIsAdmin: boolean;
  canDeleteMessages: boolean;
  canRestrictMembers: boolean;
  canInviteUsers: boolean;
  canPinMessages: boolean;
  problems: string[];
}

export interface PublicCertificate {
  recipientName: string;
  rank: number;
  score: number;
  totalQuestions: number;
  topic: string;
  groupTitle: string;
  date: string;
  templateId: string;
  signatoryTitle: string;
  signatoryName: string;
  certId: string;
}

export interface GroupAccess {
  role: 'admin' | 'helper';
  perms: HelperPerms;
}

export interface MeResponse {
  access: Record<string, GroupAccess>;
  user: TgUser;
  isOwner: boolean;
  groups: GroupRecord[];
  botUsername: string;
}
