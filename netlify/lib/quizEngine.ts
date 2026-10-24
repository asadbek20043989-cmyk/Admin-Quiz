import { createHash } from 'node:crypto';
import type { GroupRecord, ParticipantResult, PublicCertificate, QuizRecord } from '../../src/types/index.ts';
import { esc, formatDateUz, tashkentHour, tashkentMonth, uid as makeId, WEBHOOK_SECRET } from './config.ts';
import { getGroup, getJSON, getQuiz, getText, listKeys, saveGroup, saveQuiz, setText, updateIndex, upsertSummary, setJSON } from './db.ts';
import { botUsername, sendMessage, tg } from './tg.ts';
import { recordQuizFinished } from './stats.ts';
import { siteUrl } from './ads.ts';

const pollCache = new Map<string, string>();

async function pollMap(pollId: string): Promise<{ quizId: string; idx: number; correct: number } | null> {
  let v = pollCache.get(pollId) ?? (await getText(`poll/${pollId}`));
  if (!v) return null;
  pollCache.set(pollId, v);
  const [quizId, idx, correct] = v.split('|');
  return { quizId, idx: Number(idx), correct: Number(correct) };
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `${r}.`);

async function dm(userId: string, text: string) {
  await sendMessage(userId, text);
}

// ---------------------------------------------------------------- starting
export async function startQuiz(quizId: string): Promise<{ ok: boolean; error?: string }> {
  const quiz = await getQuiz(quizId);
  if (!quiz) return { ok: false, error: 'Quiz topilmadi' };
  if (quiz.status !== 'draft' && quiz.status !== 'scheduled') return { ok: false, error: 'Bu quiz allaqachon yuborilgan yoki bekor qilingan' };
  const g = await getGroup(quiz.groupId);
  if (!g) return { ok: false, error: 'Guruh topilmadi' };
  if (g.status !== 'active') return { ok: false, error: "Guruh faol emas (to'xtatilgan yoki bot olib tashlangan)" };

  if (g.runningQuizId) {
    const cur = await getQuiz(g.runningQuizId);
    if (cur && cur.status === 'running' && cur.id !== quiz.id) return { ok: false, error: "Guruhda boshqa quiz hozir davom etmoqda. Tugashini kuting yoki /stop yuboring." };
  }

  const n = quiz.questions.length;
  const intro =
    `🎯 <b>Viktorina boshlanmoqda!</b>\n\n📚 Mavzu: <b>${esc(quiz.topic)}</b>\n❓ Savollar: <b>${n} ta</b>\n⏱ Har bir savolga: <b>${quiz.secondsPerQuestion} soniya</b>\n` +
    `🏆 G'oliblar: <b>Top-${quiz.winnersCount}</b> (sertifikat)\n\nHar bir to'g'ri javob +1 ball, tezroq javob qo'shimcha ball beradi. Omad!`;
  const a = await sendMessage(g.tgChatId, intro);
  if (!a.ok) return { ok: false, error: `Guruhga yuborib bo'lmadi: ${a.description || 'bot guruhda admin emas'}` };

  const prev = { status: quiz.status, scheduledAt: quiz.scheduledAt };
  quiz.status = 'running';
  quiz.startedAt = new Date().toISOString();
  quiz.cursor = -1;
  quiz.qSentAt = [];
  quiz.pollIds = [];
  quiz.messageIds = [];
  g.runningQuizId = quiz.id;
  await saveGroup(g);

  const ok = await sendQuestion(quiz, g, 0);
  if (!ok.ok) {
    quiz.status = prev.status;
    quiz.scheduledAt = prev.scheduledAt;
    quiz.startedAt = undefined;
    g.runningQuizId = undefined;
    await saveGroup(g);
    await saveQuiz(quiz);
    await updateIndex(quiz);
    return { ok: false, error: `Savol yuborilmadi: ${ok.error}` };
  }
  await upsertSummary(quiz);
  await launchRunner(quiz.id);
  return { ok: true };
}

// A background function sleeps until each question's time is over and then sends the next one
// (or publishes the results). A fresh token makes any older runner for this quiz exit.
export async function launchRunner(quizId: string) {
  const quiz = await getQuiz(quizId);
  if (!quiz || quiz.status !== 'running') return;
  quiz.runner = makeId('rn');
  await saveQuiz(quiz);
  const site = await siteUrl();
  if (!site) return;
  try {
    await fetch(`${site}/.netlify/functions/quiz-runner-background`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runner-secret': WEBHOOK_SECRET() },
      body: JSON.stringify({ quizId, token: quiz.runner }),
    });
  } catch {
    /* the 5-minute cron will relaunch a stalled quiz */
  }
}

async function sendQuestion(quiz: QuizRecord, g: GroupRecord, idx: number): Promise<{ ok: boolean; error?: string }> {
  const q = quiz.questions[idx];
  const period = clamp(quiz.secondsPerQuestion, 5, 600);
  const r = await tg<{ message_id: number; poll: { id: string } }>('sendPoll', {
    chat_id: g.tgChatId,
    question: `${idx + 1}/${quiz.questions.length}. ${q.text}`.slice(0, 300),
    options: q.options.map(o => ({ text: o.slice(0, 100) })),
    type: 'quiz',
    is_anonymous: false,
    correct_option_id: q.correctOptionIndex,
    explanation: q.explanation ? q.explanation.slice(0, 200) : undefined,
    open_period: period,
  });
  if (!r.ok || !r.result) return { ok: false, error: r.description || 'noma\'lum xato' };
  const pollId = r.result.poll.id;
  await setText(`poll/${pollId}`, `${quiz.id}|${idx}|${q.correctOptionIndex}`);
  pollCache.set(pollId, `${quiz.id}|${idx}|${q.correctOptionIndex}`);
  const now = Date.now();
  quiz.cursor = idx;
  (quiz.qSentAt ||= [])[idx] = now;
  (quiz.pollIds ||= [])[idx] = pollId;
  (quiz.messageIds ||= [])[idx] = r.result.message_id;
  quiz.nextAt = now + period * 1000;
  await saveQuiz(quiz);
  await updateIndex(quiz);
  return { ok: true };
}

// ---------------------------------------------------------------- events
export async function recordAnswer(pollId: string, user: { id: number; first_name?: string; last_name?: string; username?: string }, optionIds: number[]) {
  if (!optionIds || optionIds.length === 0) return;
  const m = await pollMap(pollId);
  if (!m) return;
  const uid = String(user.id);
  const ts = Date.now().toString(36);
  await Promise.all([
    setText(`a/${m.quizId}/${uid}/${m.idx}/${optionIds[0]}/${ts}`, '1'),
    seenUsers.has(`${m.quizId}:${uid}`)
      ? Promise.resolve()
      : setJSON(`un/${m.quizId}/${uid}`, {
          n: [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username || 'Ishtirokchi',
          u: user.username,
        }).then(() => void seenUsers.add(`${m.quizId}:${uid}`)),
  ]);
}
const seenUsers = new Set<string>();

export async function advance(quizId: string, closedIdx: number) {
  const quiz = await getQuiz(quizId);
  if (!quiz || quiz.status !== 'running' || quiz.cursor !== closedIdx) return;
  if (closedIdx + 1 < quiz.questions.length) {
    const g = await getGroup(quiz.groupId);
    if (!g) return;
    const r = await sendQuestion(quiz, g, closedIdx + 1);
    if (!r.ok) {
      await dm(quiz.createdBy, `⚠️ «${esc(quiz.topic)}» quizida ${closedIdx + 2}-savolni yuborib bo'lmadi: ${esc(r.error || '')}. Natijalar hozirgi holatda e'lon qilinadi.`);
      await finalizeQuiz(quizId);
    }
  } else {
    await finalizeQuiz(quizId);
  }
}

export async function stopQuiz(quizId: string) {
  const quiz = await getQuiz(quizId);
  if (!quiz) return;
  if (quiz.status === 'running') {
    const idx = quiz.cursor ?? -1;
    const mid = quiz.messageIds?.[idx];
    const g = await getGroup(quiz.groupId);
    if (g && mid) await tg('stopPoll', { chat_id: g.tgChatId, message_id: mid });
    await finalizeQuiz(quizId);
  } else if (quiz.status === 'scheduled' || quiz.status === 'draft') {
    quiz.status = 'cancelled';
    await saveQuiz(quiz);
    await updateIndex(quiz);
    await upsertSummary(quiz);
  }
}

// ---------------------------------------------------------------- finishing
export async function finalizeQuiz(quizId: string) {
  const quiz = await getQuiz(quizId);
  if (!quiz || quiz.status !== 'running') return;
  const g = await getGroup(quiz.groupId);
  if (!g) return;

  // Mark finished first so duplicate triggers become no-ops.
  quiz.status = 'finished';
  quiz.finishedAt = new Date().toISOString();
  await saveQuiz(quiz);

  const prefix = `a/${quiz.id}/`;
  const keys = await listKeys(prefix);
  const period = clamp(quiz.secondsPerQuestion, 5, 600) * 1000;

  interface Acc { correct: number; bonus: number; time: number; answered: Set<number> }
  const users = new Map<string, Acc>();
  const perQ = quiz.questions.map(() => ({ answered: 0, wrong: 0 }));
  for (const key of keys) {
    const [uid, idxS, chosenS, ts36] = key.slice(prefix.length).split('/');
    const idx = Number(idxS);
    const q = quiz.questions[idx];
    const sent = quiz.qSentAt?.[idx];
    if (!q || !sent) continue;
    const acc = users.get(uid) || { correct: 0, bonus: 0, time: 0, answered: new Set<number>() };
    if (acc.answered.has(idx)) continue; // only the first answer counts
    const rt = parseInt(ts36, 36) - sent;
    if (rt > period + 4000) continue; // late answer
    const t = clamp(rt, 0, period);
    acc.answered.add(idx);
    acc.time += t;
    perQ[idx].answered++;
    if (Number(chosenS) === q.correctOptionIndex) {
      acc.correct++;
      acc.bonus += 0.5 * (1 - t / period);
    } else perQ[idx].wrong++;
    users.set(uid, acc);
  }

  const ranked = [...users.entries()]
    .map(([userId, a]) => ({ userId, correct: a.correct, score: Math.round((a.correct + a.bonus) * 100) / 100, time: a.time }))
    .sort((x, y) => y.score - x.score || y.correct - x.correct || x.time - y.time);

  const top = ranked.slice(0, 30);
  const names = await Promise.all(top.map(r => getJSON<{ n: string; u?: string }>(`un/${quiz.id}/${r.userId}`)));

  // Certificate quota
  const monthKey = tashkentMonth();
  if (g.plan.certMonthKey !== monthKey) {
    g.plan.certMonthKey = monthKey;
    g.plan.certMonthlyUsed = 0;
  }
  let quotaLeft = Math.max(0, g.plan.certMonthlyQuota - g.plan.certMonthlyUsed);
  let issued = 0;
  const results: ParticipantResult[] = top.map((r, i) => {
    const rank = i + 1;
    const eligible = rank <= quiz.winnersCount && r.correct >= 1 && quotaLeft > 0;
    if (eligible) {
      quotaLeft--;
      issued++;
    }
    return {
      userId: r.userId,
      name: names[i]?.n || 'Ishtirokchi',
      username: names[i]?.u,
      score: r.score,
      correctCount: r.correct,
      totalTimeSeconds: Math.round(r.time / 1000),
      rank,
      certificateIssued: eligible,
    };
  });

  quiz.results = results;
  quiz.participantCount = ranked.length;
  quiz.nextAt = undefined;
  await saveQuiz(quiz);
  await upsertSummary(quiz);
  await updateIndex(quiz);

  g.runningQuizId = undefined;
  g.plan.certMonthlyUsed += issued;

  // Results post
  try {
    await postResults(quiz, g, results);
  } catch {
    /* results are saved even if posting fails */
  }
  await saveGroup(g);

  const answeredTotal = perQ.reduce((a, b) => a + b.answered, 0);
  const wrongTotal = perQ.reduce((a, b) => a + b.wrong, 0);
  await recordQuizFinished(g, {
    topic: quiz.topic,
    startHour: tashkentHour(quiz.startedAt ? new Date(quiz.startedAt) : new Date()),
    participants: ranked.length,
    pcts: ranked.map(r => (r.correct / quiz.questions.length) * 100),
    answered: answeredTotal,
    wrong: wrongTotal,
    certs: issued,
  });
}

async function postResults(quiz: QuizRecord, g: GroupRecord, results: ParticipantResult[]) {
  const n = quiz.questions.length;
  let text = `🏁 <b>Viktorina yakunlandi!</b>\n📚 Mavzu: <b>${esc(quiz.topic)}</b>\n👥 Ishtirokchilar: <b>${quiz.participantCount || 0}</b> · ❓ Savollar: <b>${n}</b>\n`;
  const rows: { text: string; url: string }[][] = [];
  if (results.length === 0) {
    text += `\nAfsuski, bu safar hech kim qatnashmadi. Keyingisida ko'rishamiz! 👋`;
  } else {
    text += `\n🏆 <b>Natijalar</b>\n`;
    for (const r of results.slice(0, 10)) {
      text += `${medal(r.rank)} <a href="tg://user?id=${r.userId}">${esc(r.name)}</a> — <b>${r.score}</b> ball (${r.correctCount}/${n}) · ${r.totalTimeSeconds}s\n`;
    }
    const winners = results.filter(r => r.certificateIssued);
    if (winners.length) {
      text += `\n🎓 <b>Tabriklaymiz, g'oliblar!</b> Sertifikatingizni quyidagi tugma orqali oling.`;
      const bot0 = await botUsername();
      const short = process.env.MINIAPP_SHORTNAME || '';
      const site = await siteUrl();
      for (const w of winners) {
        // A t.me Mini App link opens directly (no "Open this link?" dialog); the site link is the fallback.
        const url = bot0 && short ? `https://t.me/${bot0}/${short}?startapp=cert_${quiz.id}_${w.userId}` : site ? `${site}/cert.html?q=${quiz.id}&u=${w.userId}` : '';
        if (url) rows.push([{ text: `🎓 ${w.rank}-o'rin: ${w.name}`.slice(0, 60), url }]);
      }
    } else if (results.every(r => r.correctCount === 0)) {
      text += `\nSertifikat olish uchun kamida 1 ta to'g'ri javob kerak.`;
    }
  }
  const bot = await botUsername();
  if (bot && results.length) rows.push([{ text: "📝 Xatolarimni ko'rish", url: `https://t.me/${bot}?start=review_${quiz.id}` }]);
  await sendMessage(g.tgChatId, text, rows.length ? { reply_markup: { inline_keyboard: rows } } : {});
}

// ---------------------------------------------------------------- private-chat helpers
export async function reviewText(quizId: string, userId: string): Promise<string> {
  const quiz = await getQuiz(quizId);
  if (!quiz || quiz.status !== 'finished') return "Bu quiz topilmadi yoki hali yakunlanmagan.";
  const keys = await listKeys(`a/${quizId}/${userId}/`);
  const answers = new Map<number, number>();
  const pre = `a/${quizId}/${userId}/`;
  for (const k of keys) {
    const [idx, chosen] = k.slice(pre.length).split('/');
    if (!answers.has(Number(idx))) answers.set(Number(idx), Number(chosen));
  }
  if (answers.size === 0) return "Siz bu quizda qatnashmagansiz.";
  let out = `📝 <b>Xatolar tahlili</b> — «${esc(quiz.topic)}»\n`;
  let mistakes = 0;
  quiz.questions.forEach((q, i) => {
    const chosen = answers.get(i);
    if (chosen === q.correctOptionIndex) return;
    mistakes++;
    out += `\n<b>${i + 1}. ${esc(q.text)}</b>\n`;
    out += chosen === undefined ? `⏭ Javob berilmagan\n` : `❌ Sizning javobingiz: ${esc(q.options[chosen] ?? '?')}\n`;
    out += `✅ To'g'ri javob: ${esc(q.options[q.correctOptionIndex])}\n`;
    if (q.explanation) out += `💡 ${esc(q.explanation)}\n`;
  });
  if (mistakes === 0) return `🎉 Zo'r! «${esc(quiz.topic)}» quizida birorta ham xato qilmadingiz.`;
  return out.slice(0, 3900);
}

export async function publicCertificate(quizId: string, userId: string): Promise<PublicCertificate | null> {
  const quiz = await getQuiz(quizId);
  if (!quiz || quiz.status !== 'finished' || !quiz.results) return null;
  const r = quiz.results.find(x => x.userId === userId && x.certificateIssued);
  if (!r) return null;
  const g = await getGroup(quiz.groupId);
  if (!g) return null;
  return {
    recipientName: r.name,
    rank: r.rank,
    score: r.correctCount,
    totalQuestions: quiz.questions.length,
    topic: quiz.topic,
    groupTitle: g.title,
    date: formatDateUz(new Date(quiz.finishedAt || Date.now())),
    templateId: g.certificateSettings.templateId,
    signatoryTitle: g.certificateSettings.signatoryTitle,
    signatoryName: g.certificateSettings.signatoryName,
    certId: 'QZ-' + createHash('sha256').update(`${quizId}:${userId}`).digest('hex').slice(0, 8).toUpperCase(),
  };
}

// ---------------------------------------------------------------- scheduler
export async function runDue(): Promise<void> {
  const { getIndex } = await import('./db.ts');
  const idx = await getIndex();
  const now = Date.now();
  for (const s of idx.scheduled.filter(s => s.at <= now)) {
    const r = await startQuiz(s.id);
    if (!r.ok) {
      const q = await getQuiz(s.id);
      if (q && q.status === 'scheduled') {
        // Could not start (e.g. other quiz running): retry for up to 30 minutes, then give up.
        if (now - s.at > 30 * 60 * 1000) {
          q.status = 'cancelled';
          await saveQuiz(q);
          await updateIndex(q);
          await upsertSummary(q);
          await dm(q.createdBy, `⚠️ «${esc(q.topic)}» rejalashtirilgan quizini boshlab bo'lmadi: ${esc(r.error || '')}`);
        }
      }
    }
  }
  // Owner-scheduled ads that are due
  const dueAds = (idx.ads || []).filter(a => a.at <= now);
  if (dueAds.length) {
    const { sendAdToGroups } = await import('./ads.ts');
    const { getIndex: reload, setJSON: put } = await import('./db.ts');
    for (const a of dueAds) await sendAdToGroups(a.adId, a.groupIds);
    const fresh = await reload();
    fresh.ads = (fresh.ads || []).filter(a => !dueAds.some(d => d.adId === a.adId && d.at === a.at));
    await put('idx/active', fresh);
  }
  // Recover quizzes whose background runner stopped (deploy, timeout): relaunch it.
  for (const r of idx.running.filter(r => r.nextAt + 90000 < now)) {
    const q = await getQuiz(r.id);
    if (q && q.status === 'running') await launchRunner(q.id);
    else if (q) await updateIndex(q);
  }
}
