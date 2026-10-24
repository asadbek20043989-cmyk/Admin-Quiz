import { randomInt } from 'node:crypto';
import type {
  AdminCodeRecord, AdRecord, BotHealth, CertificateTemplate, GroupRecord, MeResponse, ModerationLog, QuestionRecord, QuizRecord, QuizSummary,
} from '../../src/types/index.ts';
import { authenticate, displayName, type AuthedUser } from '../lib/auth.ts';
import { audit, getGroup, getJSON, getQuiz, groupsOfAdmin, listAllGroups, removeSummary, saveGroup, saveQuiz, setJSON, updateIndex, upsertSummary, del } from '../lib/db.ts';
import { botId, botUsername, sendMessage, tg } from '../lib/tg.ts';
import { esc, uid, WEBHOOK_SECRET, BOT_TOKEN, GEMINI_KEY, SUPER_ADMIN_IDS } from '../lib/config.ts';
import { refreshMemberCount, rollQuotas } from '../lib/groups.ts';
import { generateQuiz } from '../lib/ai.ts';
import { getStats, saveStats, snapshotMembers, toOverview } from '../lib/stats.ts';
import { getAds, saveAds, siteUrl } from '../lib/ads.ts';
import { hashCode, setupBot } from '../lib/bot.ts';
import { publicCertificate, startQuiz, stopQuiz } from '../lib/quizEngine.ts';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (message: string, status = 400) => json({ error: message }, status);

const TEMPLATES: CertificateTemplate[] = [
  { id: 'tmpl-modern-gold', name: 'Zamonaviy Oltin', description: "Qora va oltin ranglardagi nafis sertifikat.", primaryColor: '#eab308' },
  { id: 'tmpl-royal-indigo', name: 'Qirollik Moviy', description: 'Chuqur nilufar rangdagi rasmiy diplom.', primaryColor: '#6366f1' },
  { id: 'tmpl-emerald-classic', name: 'Zumrad Klassik', description: "An'anaviy ta'lim uslubi.", primaryColor: '#10b981' },
];

const num = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : def;
};
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

async function ownGroup(me: AuthedUser, gid: string): Promise<GroupRecord> {
  const g = await getGroup(gid);
  if (!g || g.adminId !== String(me.user.id)) throw new HttpError(403, "Bu guruhga ruxsatingiz yo'q");
  return g;
}
async function ownQuiz(me: AuthedUser, qid: string): Promise<{ quiz: QuizRecord; group: GroupRecord }> {
  const quiz = await getQuiz(qid);
  if (!quiz) throw new HttpError(404, 'Quiz topilmadi');
  return { quiz, group: await ownGroup(me, quiz.groupId) };
}
const activeOnly = (g: GroupRecord) => {
  if (g.status !== 'active') throw new HttpError(403, "Guruh hozir faol emas (to'xtatilgan yoki bot olib tashlangan)");
};

export default async (req: Request) => {
  const url = new URL(req.url);

  // ---- Ad click tracking: /r/:adId/:groupId
  if (url.pathname.startsWith('/r/')) {
    const [, , adId] = url.pathname.split('/');
    const ads = await getAds();
    const ad = ads.find(a => a.id === adId);
    if (!ad || !ad.buttonUrl || !/^https?:\/\//i.test(ad.buttonUrl)) return new Response('Not found', { status: 404 });
    ad.clicks += 1;
    await saveAds(ads);
    return Response.redirect(ad.buttonUrl, 302);
  }

  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const method = req.method;

  try {
    // ---- Public: certificate data (no login; certificate pages are shareable)
    if (parts[0] === 'cert' && method === 'GET') {
      const c = await publicCertificate(url.searchParams.get('q') || '', url.searchParams.get('u') || '');
      return c ? json(c) : err('Sertifikat topilmadi', 404);
    }

    const me = authenticate(req);
    if (!me) return err('Telegram orqali kiring (autentifikatsiya muvaffaqiyatsiz)', 401);

    // ---- Owner (Super Admin) area — enforced on the server
    if (parts[0] === 'owner') {
      if (!me.isOwner) return err('Ruxsat yo\'q', 403);
      return await ownerRoutes(parts.slice(1), method, req, me, url);
    }

    // ---- Admin area
    const body = method === 'GET' || method === 'DELETE' ? {} : await req.json().catch(() => ({}));

    if (parts[0] === 'me' && method === 'GET') {
      const groups = await groupsOfAdmin(String(me.user.id));
      for (const g of groups) await maintainGroup(g);
      const out: MeResponse = { user: me.user, isOwner: me.isOwner, groups: await groupsOfAdmin(String(me.user.id)), botUsername: await botUsername() };
      return json(out);
    }

    if (parts[0] === 'certificate-templates') return json(TEMPLATES);

    if (parts[0] === 'groups' && parts[1]) {
      const g = await ownGroup(me, parts[1]);
      const sub = parts[2];

      if (!sub && method === 'GET') return json(g);

      if (sub === 'health' && method === 'GET') return json(await health(g));

      if (sub === 'settings' && method === 'PATCH') {
        const b: any = body;
        const s = g.settings;
        for (const k of ['autoApproveJoin', 'welcomeEnabled', 'antiSpamEnabled', 'filterLinks', 'filterForwards', 'explainEnabled'] as const) {
          if (typeof b[k] === 'boolean') s[k] = b[k];
        }
        if (b.welcomeMessage !== undefined) s.welcomeMessage = str(b.welcomeMessage, 1000);
        if (b.rules !== undefined) s.rules = str(b.rules, 2000);
        if (Array.isArray(b.bannedWords)) s.bannedWords = [...new Set(b.bannedWords.map((w: unknown) => str(w, 40).toLowerCase()).filter(Boolean))].slice(0, 100) as string[];
        await saveGroup(g);
        await audit(displayName(me.user), 'SOZLAMALAR_YANGILANDI', `«${g.title}» sozlamalari yangilandi`, g.id);
        return json({ success: true, group: g });
      }

      if (sub === 'certificate-settings' && method === 'PATCH') {
        const b: any = body;
        const c = g.certificateSettings;
        if (TEMPLATES.some(t => t.id === b.templateId)) c.templateId = b.templateId;
        if (b.winnersCount !== undefined) c.winnersCount = num(b.winnersCount, 1, 10, c.winnersCount);
        if (b.minScore !== undefined) c.minScore = num(b.minScore, 0, 30, c.minScore);
        if (b.signatoryTitle !== undefined) c.signatoryTitle = str(b.signatoryTitle, 60) || c.signatoryTitle;
        if (b.signatoryName !== undefined) c.signatoryName = str(b.signatoryName, 60) || c.signatoryName;
        await saveGroup(g);
        return json({ success: true, group: g });
      }

      if (sub === 'stats' && method === 'GET') {
        await refreshMemberCount(g);
        await saveGroup(g);
        return json(toOverview(g, await getStats(g.id)));
      }

      if (sub === 'moderation' && method === 'GET') {
        return json({ logs: (await getJSON<ModerationLog[]>(`mod/${g.id}`)) || [] });
      }

      if (sub === 'ads') {
        if (method === 'GET') {
          const ads = (await getAds()).filter(a => a.status === 'active' && (a.targetGroupIds.length === 0 || a.targetGroupIds.includes(g.id)));
          return json({
            ads: ads.map(a => ({ id: a.id, title: a.title, text: a.text })),
            adFrequencyPerWeek: g.settings.adFrequencyPerWeek,
            adMinPerWeek: g.plan.adMinPerWeek,
            adMaxPerWeek: g.plan.adMaxPerWeek,
            adFree: g.settings.adFree,
            postedLastWeek: (g.adLog || []).filter(t => Date.now() - new Date(t).getTime() < 7 * 86400000).length,
          });
        }
        if (method === 'PATCH') {
          const f = Number((body as any).frequency);
          if (!Number.isInteger(f) || f < g.plan.adMinPerWeek || f > g.plan.adMaxPerWeek) return err(`Reklama chastotasi ${g.plan.adMinPerWeek}–${g.plan.adMaxPerWeek} oralig'ida bo'lishi kerak`);
          g.settings.adFrequencyPerWeek = f;
          await saveGroup(g);
          return json({ success: true });
        }
      }

      if (sub === 'quizzes') {
        if (parts[3] === 'generate' && method === 'POST') {
          activeOnly(g);
          const b: any = body;
          if (rollQuotas(g)) await saveGroup(g);
          if (g.plan.aiDailyUsed >= g.plan.aiDailyQuota) return err("Guruhning kunlik AI kvotasi tugadi. Super Adminga murojaat qiling yoki ertaga urinib ko'ring.", 429);
          const topic = str(b.topic, 120);
          if (!topic) return err('Mavzu kiritilishi shart');
          try {
            const r = await generateQuiz({
              topic,
              difficulty: ['beginner', 'elementary', 'intermediate', 'upper_intermediate', 'advanced'].includes(b.difficulty) ? b.difficulty : 'intermediate',
              questionCount: num(b.questionCount, 1, 30, 5),
              optionsCount: num(b.optionsCount, 3, 4, 4),
              language: b.language === 'en' ? 'en' : 'uz',
            });
            g.plan.aiDailyUsed += 1;
            await saveGroup(g);
            return json({ success: true, questions: r.questions, tokensUsed: r.tokens });
          } catch (e: any) {
            return err(e?.message || "AI bilan bog'lanib bo'lmadi", 502);
          }
        }
        if (!parts[3] && method === 'GET') return json((await getJSON<QuizSummary[]>(`gq/${g.id}`)) || []);
        if (!parts[3] && method === 'POST') return await createQuiz(g, me, body as any);
      }
    }

    if (parts[0] === 'quizzes' && parts[1]) {
      const { quiz, group } = await ownQuiz(me, parts[1]);
      if (!parts[2] && method === 'GET') return json(quiz);
      if (parts[2] === 'send' && method === 'POST') {
        const r = await startQuiz(quiz.id);
        if (!r.ok) return err(r.error || 'Yuborib bo\'lmadi', 409);
        await audit(displayName(me.user), 'QUIZ_YUBORILDI', `«${quiz.topic}» guruhga yuborildi`, group.id);
        return json({ success: true });
      }
      if (parts[2] === 'stop' && method === 'POST') {
        await stopQuiz(quiz.id);
        return json({ success: true });
      }
      if (!parts[2] && method === 'DELETE') {
        if (quiz.status === 'running') return err("Davom etayotgan quizni o'chirib bo'lmaydi. Avval to'xtating.");
        await del(`q/${quiz.id}`);
        await removeSummary(group.id, quiz.id);
        const fresh = { ...quiz, status: 'cancelled' as const };
        await updateIndex(fresh);
        return json({ success: true });
      }
    }

    return err('Topilmadi', 404);
  } catch (e: any) {
    if (e instanceof HttpError) return err(e.message, e.status);
    console.error('api error', e);
    return err('Server xatosi. Qayta urinib ko\'ring.', 500);
  }
};

export const config = { path: ['/api/*', '/r/*'] };

// ---------------------------------------------------------------------------
async function maintainGroup(g: GroupRecord) {
  let dirty = rollQuotas(g);
  const last = g.adminCheckedAt ? new Date(g.adminCheckedAt).getTime() : 0;
  if (g.status === 'active' && Date.now() - last > 3600 * 1000) {
    g.adminCheckedAt = new Date().toISOString();
    dirty = true;
    const r = await tg<{ status: string }>('getChatMember', { chat_id: g.tgChatId, user_id: Number(g.adminId) });
    if (r.ok && r.result && !['creator', 'administrator'].includes(r.result.status)) {
      g.status = 'inactive';
      await audit('Tizim', 'ADMIN_HUQUQI_YOQOLDI', `${g.adminName} «${g.title}» guruhida endi admin emas`, g.id);
      for (const id of SUPER_ADMIN_IDS()) await sendMessage(id, `⚠️ ${esc(g.adminName)} «${esc(g.title)}» guruhida endi admin emas. Guruh faol emas deb belgilandi.`);
    } else {
      const before = g.memberCountAt;
      await refreshMemberCount(g);
      if (g.memberCountAt !== before) await snapshotMembers(g);
    }
  }
  if (dirty) await saveGroup(g);
}

async function health(g: GroupRecord): Promise<BotHealth> {
  const r = await tg<any>('getChatMember', { chat_id: g.tgChatId, user_id: await botId() });
  const m = r.result || {};
  const isAdm = r.ok && m.status === 'administrator';
  const h: BotHealth = {
    botIsAdmin: isAdm,
    canDeleteMessages: isAdm && !!m.can_delete_messages,
    canRestrictMembers: isAdm && !!m.can_restrict_members,
    canInviteUsers: isAdm && !!m.can_invite_users,
    canPinMessages: isAdm && !!m.can_pin_messages,
    problems: [],
  };
  if (!isAdm) h.problems.push('Bot guruhda admin emas');
  else {
    if (!h.canDeleteMessages) h.problems.push("«Xabarlarni o'chirish» huquqi yo'q (anti-spam ishlamaydi)");
    if (!h.canRestrictMembers) h.problems.push("«A'zolarni cheklash» huquqi yo'q (mute/ban ishlamaydi)");
    if (!h.canInviteUsers) h.problems.push("«Taklif qilish» huquqi yo'q (qo'shilish so'rovlarini tasdiqlab bo'lmaydi)");
  }
  return h;
}

function cleanQuestions(raw: any): QuestionRecord[] | string {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 30) return "Savollar soni 1 dan 30 gacha bo'lishi kerak";
  const out: QuestionRecord[] = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i];
    const text = str(q?.text, 300);
    const options = Array.isArray(q?.options) ? q.options.map((o: unknown) => str(o, 100)).filter(Boolean) : [];
    const ci = Number(q?.correctOptionIndex);
    if (!text) return `${i + 1}-savol matni bo'sh`;
    if (options.length < 2 || options.length > 4) return `${i + 1}-savolda 2 dan 4 gacha variant bo'lishi kerak`;
    if (new Set(options.map((o: string) => o.toLowerCase())).size !== options.length) return `${i + 1}-savolda bir xil variantlar bor`;
    if (!Number.isInteger(ci) || ci < 0 || ci >= options.length) return `${i + 1}-savolda to'g'ri javob tanlanmagan`;
    out.push({ id: `q-${Date.now()}-${i + 1}`, position: i + 1, text, options, correctOptionIndex: ci, explanation: str(q?.explanation, 200), verified: true });
  }
  return out;
}

async function createQuiz(g: GroupRecord, me: AuthedUser, b: any) {
  activeOnly(g);
  const questions = cleanQuestions(b.questions);
  if (typeof questions === 'string') return err(questions);
  const topic = str(b.topic, 120);
  if (!topic) return err('Mavzu kiritilishi shart');
  const mode = ['draft', 'now', 'schedule'].includes(b.mode) ? b.mode : 'draft';
  let scheduledAt: string | undefined;
  if (mode === 'schedule') {
    const t = new Date(b.scheduledAt).getTime();
    if (!Number.isFinite(t) || t < Date.now() + 2 * 60 * 1000) return err("Rejalashtirilgan vaqt kamida 2 daqiqa keyin bo'lishi kerak");
    scheduledAt = new Date(t).toISOString();
  }
  const quiz: QuizRecord = {
    id: uid('qz'),
    groupId: g.id,
    topic,
    difficulty: ['beginner', 'elementary', 'intermediate', 'upper_intermediate', 'advanced'].includes(b.difficulty) ? b.difficulty : 'intermediate',
    questionCount: questions.length,
    secondsPerQuestion: num(b.secondsPerQuestion, 5, 600, 30),
    language: b.language === 'en' ? 'en' : 'uz',
    status: mode === 'schedule' ? 'scheduled' : 'draft',
    scheduledAt,
    winnersCount: num(b.winnersCount, 1, 10, g.certificateSettings.winnersCount),
    minScore: num(b.minScore, 0, questions.length, g.certificateSettings.minScore),
    createdAt: new Date().toISOString(),
    createdBy: String(me.user.id),
    questions,
  };
  await saveQuiz(quiz);
  await upsertSummary(quiz);
  await updateIndex(quiz);
  await audit(displayName(me.user), 'QUIZ_YARATILDI', `«${topic}» (${questions.length} ta savol)`, g.id);
  if (mode === 'now') {
    const r = await startQuiz(quiz.id);
    if (!r.ok) return json({ success: false, error: r.error, quiz: await getQuiz(quiz.id) }, 409);
  }
  return json({ success: true, quiz: await getQuiz(quiz.id) });
}

// ---------------------------------------------------------------------------
async function ownerRoutes(p: string[], method: string, req: Request, me: AuthedUser, url: URL): Promise<Response> {
  const body: any = method === 'GET' || method === 'DELETE' ? {} : await req.json().catch(() => ({}));
  const actor = 'Super Admin';

  if (p[0] === 'overview' && method === 'GET') {
    const groups = await listAllGroups();
    let quizzes = 0, certs = 0, aiToday = 0;
    for (const g of groups) {
      const s = await getStats(g.id);
      quizzes += s.quizzes;
      certs += s.certs;
      rollQuotas(g);
      aiToday += g.plan.aiDailyUsed;
    }
    const hook = await tg<any>('getWebhookInfo');
    return json({
      groups: groups.length,
      activeGroups: groups.filter(g => g.status === 'active').length,
      members: groups.reduce((a, g) => a + g.memberCount, 0),
      quizzes,
      certs,
      aiToday,
      botUsername: await botUsername(),
      webhook: hook.ok ? { url: hook.result.url, pending: hook.result.pending_update_count, lastError: hook.result.last_error_message || '' } : null,
      env: { botToken: !!BOT_TOKEN(), gemini: !!GEMINI_KEY(), owners: SUPER_ADMIN_IDS().length, site: await siteUrl() },
    });
  }

  if (p[0] === 'setup' && method === 'POST') {
    const origin = new URL(req.url).origin;
    const r = await setupBot(origin, WEBHOOK_SECRET());
    await audit(actor, 'BOT_ULANDI', `Webhook o'rnatildi: ${origin}/bot/webhook`);
    return r.ok ? json({ success: true, ...r }) : err(`Webhook o'rnatilmadi: ${r.description}`, 502);
  }

  if (p[0] === 'groups') {
    if (!p[1] && method === 'GET') {
      const groups = await listAllGroups();
      groups.forEach(rollQuotas);
      return json(groups);
    }
    const g = await getGroup(p[1]);
    if (!g) return err('Guruh topilmadi', 404);
    if (p[2] === 'limits' && method === 'PATCH') {
      g.plan.aiDailyQuota = num(body.aiDailyQuota, 0, 1000, g.plan.aiDailyQuota);
      g.plan.certMonthlyQuota = num(body.certMonthlyQuota, 0, 100000, g.plan.certMonthlyQuota);
      g.plan.adMinPerWeek = num(body.adMinPerWeek, 0, 14, g.plan.adMinPerWeek);
      g.plan.adMaxPerWeek = Math.max(g.plan.adMinPerWeek, num(body.adMaxPerWeek, 0, 14, g.plan.adMaxPerWeek));
      if (typeof body.adFree === 'boolean') g.settings.adFree = body.adFree;
      g.settings.adFrequencyPerWeek = Math.min(Math.max(g.settings.adFrequencyPerWeek, g.plan.adMinPerWeek), g.plan.adMaxPerWeek);
      await saveGroup(g);
      await audit(actor, 'LIMITLAR_YANGILANDI', `«${g.title}» limitlari o'zgartirildi`, g.id);
      return json({ success: true, group: g });
    }
    if (p[2] === 'toggle' && method === 'POST') {
      if (g.status === 'active') {
        if (g.runningQuizId) {
          await stopQuiz(g.runningQuizId);
          const fresh = await getGroup(g.id);
          if (fresh) Object.assign(g, fresh);
        }
        g.status = 'suspended';
      } else g.status = 'active';
      await saveGroup(g);
      await audit(actor, g.status === 'active' ? 'GURUH_FAOLLASHTIRILDI' : 'GURUH_TOXTATILDI', `«${g.title}»`, g.id);
      return json({ success: true, status: g.status });
    }
    if (p[2] === 'reset-stats' && method === 'POST') {
      await saveStats(g.id, { quizzes: 0, participantSum: 0, pctSum: 0, pctCount: 0, certs: 0, topics: {}, hours: {}, daily: {} });
      await audit(actor, 'STATISTIKA_NOLLANDI', `«${g.title}» statistikasi nollandi`, g.id);
      return json({ success: true });
    }
  }

  if (p[0] === 'codes') {
    const codes = (await getJSON<(AdminCodeRecord & { hash: string })[]>('codes')) || [];
    if (!p[1] && method === 'GET') return json(codes.map(({ hash: _h, ...c }) => c));
    if (!p[1] && method === 'POST') {
      const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      const pick = (n: number) => Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join('');
      const a = pick(4), b2 = pick(4);
      const code = `QZ-${a}-${b2}`;
      const rec: AdminCodeRecord & { hash: string } = {
        id: uid('code'),
        hash: hashCode(code),
        hint: `QZ-••••-${b2}`,
        groupTitle: str(body.groupTitle, 80) || 'Yangi guruh',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        used: false,
        revoked: false,
        plan: {
          aiDailyQuota: num(body.aiDailyQuota, 0, 1000, 20),
          certMonthlyQuota: num(body.certMonthlyQuota, 0, 100000, 200),
          adMinPerWeek: num(body.adMinPerWeek, 0, 14, 2),
        },
      };
      await setJSON('codes', [rec, ...codes].slice(0, 100));
      await audit(actor, 'KOD_YARATILDI', `«${rec.groupTitle}» uchun ulanish kodi yaratildi`);
      const { hash: _h, ...pub } = rec;
      return json({ success: true, code, codeRecord: pub }); // plain code is shown only once
    }
    if (p[1] && p[2] === 'revoke' && method === 'POST') {
      const c = codes.find(x => x.id === p[1]);
      if (!c) return err('Kod topilmadi', 404);
      c.revoked = true;
      await setJSON('codes', codes);
      await audit(actor, 'KOD_BEKOR_QILINDI', `«${c.groupTitle}» kodi bekor qilindi`);
      return json({ success: true });
    }
  }

  if (p[0] === 'ads') {
    const ads = await getAds();
    if (!p[1] && method === 'GET') return json(ads);
    if (!p[1] && method === 'POST') {
      const title = str(body.title, 100), text = str(body.text, 600);
      if (!title || !text) return err('Sarlavha va matn kiritilishi shart');
      const bu = str(body.buttonUrl, 300);
      if (bu && !/^https?:\/\//i.test(bu)) return err("Tugma havolasi http(s):// bilan boshlanishi kerak");
      const ad: AdRecord = {
        id: uid('ad'), title, text,
        imageUrl: /^https:\/\//i.test(str(body.imageUrl, 400)) ? str(body.imageUrl, 400) : undefined,
        buttonText: str(body.buttonText, 40) || undefined,
        buttonUrl: bu || undefined,
        targetGroupIds: Array.isArray(body.targetGroupIds) ? body.targetGroupIds.map(String) : [],
        status: 'active', impressions: 0, clicks: 0, createdAt: new Date().toISOString(),
      };
      await saveAds([ad, ...ads]);
      await audit(actor, 'REKLAMA_YARATILDI', `«${title}»`);
      return json({ success: true, ad });
    }
    const ad = ads.find(a => a.id === p[1]);
    if (!ad) return err('Reklama topilmadi', 404);
    if (method === 'PATCH') {
      ad.status = ad.status === 'active' ? 'paused' : 'active';
      await saveAds(ads);
      return json({ success: true, ad });
    }
    if (method === 'DELETE') {
      await saveAds(ads.filter(a => a.id !== ad.id));
      return json({ success: true });
    }
  }

  if (p[0] === 'audit' && method === 'GET') return json((await getJSON('audit')) || []);

  if (p[0] === 'broadcast' && method === 'POST') {
    const text = str(body.text, 3500);
    if (!text) return err('Xabar matnini kiriting');
    const admins = [...new Set((await listAllGroups()).map(g => g.adminId))];
    let sent = 0;
    for (const id of admins) if ((await sendMessage(id, `📣 <b>E'lon</b>\n\n${esc(text)}`)).ok) sent++;
    await audit(actor, 'XABAR_YUBORILDI', `${sent}/${admins.length} adminga e'lon yuborildi`);
    return json({ success: true, sent, total: admins.length });
  }

  void me; void url;
  return err('Topilmadi', 404);
}
