import { createHash } from 'node:crypto';
import type { AdminCodeRecord, ModerationLog } from '../../src/types/index.ts';
import { CODE_PEPPER, esc, isOwnerId, SUPER_ADMIN_IDS, uid } from './config.ts';
import { addGroupToAdmin, audit, getGroup, getJSON, groupsOfAdmin, saveGroup, setJSON, setText } from './db.ts';
import { botId, botUsername, isChatAdmin, sendMessage, tg } from './tg.ts';
import { newGroup, migrateGroup } from './groups.ts';
import { onPollClosed, recordAnswer, reviewText, stopQuiz } from './quizEngine.ts';
import { explainGrammar } from './ai.ts';
import { siteUrl } from './ads.ts';
import { displayName } from './auth.ts';

export const hashCode = (code: string) => createHash('sha256').update(CODE_PEPPER() + code.trim().toUpperCase()).digest('hex');

// Plain group messages are the highest-volume event, so group settings are cached in memory
// (per warm function instance) for 60 seconds to avoid a blob read on every message.
const groupCache = new Map<string, { g: Awaited<ReturnType<typeof getGroup>>; at: number }>();
async function cachedGroup(id: string) {
  const hit = groupCache.get(id);
  if (hit && Date.now() - hit.at < 60000) return hit.g;
  const g = await getGroup(id);
  groupCache.set(id, { g, at: Date.now() });
  return g;
}

const explainHits = new Map<string, number[]>();
const rateOk = (key: string, max: number, windowMs: number) => {
  const now = Date.now();
  const arr = (explainHits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  explainHits.set(key, arr);
  return true;
};

export async function handleUpdate(u: any): Promise<void> {
  if (u.poll_answer) {
    const a = u.poll_answer;
    if (a.user) await recordAnswer(a.poll_id || a.poll?.id, a.user, a.option_ids || []);
    return;
  }
  if (u.poll) {
    if (u.poll.is_closed) await onPollClosed(u.poll.id);
    return;
  }
  if (u.chat_join_request) return onJoinRequest(u.chat_join_request);
  if (u.my_chat_member) return onMyChatMember(u.my_chat_member);
  if (u.message) return onMessage(u.message);
}

// ------------------------------------------------------------------ messages
async function onMessage(m: any) {
  const chat = m.chat;
  if (m.migrate_to_chat_id) {
    await migrateGroup(String(chat.id), String(m.migrate_to_chat_id));
    return;
  }
  const text: string = (m.text || '').trim();
  const from = m.from;
  if (!from) return;

  if (chat.type === 'private') {
    if (!text.startsWith('/')) return;
    return onPrivateCommand(m, text);
  }

  // ---- group / supergroup
  if (m.new_chat_members?.length) return onNewMembers(m);

  if (text.startsWith('/')) {
    const [cmdRaw, ...rest] = text.split(/\s+/);
    const cmd = cmdRaw.split('@')[0].toLowerCase();
    const arg = rest.join(' ');
    if (cmd === '/link') return onLink(m, arg);
    if (cmd === '/stop') return onStopCmd(m);
    if (cmd === '/explain') return onExplain(m, arg);
    if (cmd === '/warn' || cmd === '/ban') return onModCommand(m, cmd);
    return;
  }
  return onModerate(m);
}

async function openPanelButton(chatId: number | string, text: string, path: string, label: string) {
  const site = await siteUrl();
  if (!site) return sendMessage(chatId, text + '\n\n⚠️ Sayt manzili sozlanmagan (SITE_URL).');
  return sendMessage(chatId, text, { reply_markup: { inline_keyboard: [[{ text: label, web_app: { url: site + path } }]] } });
}

async function onPrivateCommand(m: any, text: string) {
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.split('@')[0].toLowerCase();
  const arg = rest.join(' ').trim();
  const from = m.from;
  const chatId = m.chat.id;

  if (cmd === '/owner') {
    // Only the owner gets any response. Everyone else is ignored silently.
    if (!isOwnerId(from.id)) return;
    return openPanelButton(chatId, '🛡 <b>Super Admin paneli</b>', '/owner.html', '🛡 Super Admin panelini ochish');
  }

  if (cmd === '/panel' || cmd === '/admin') {
    const groups = await groupsOfAdmin(String(from.id));
    if (!groups.length) return sendMessage(chatId, "Sizda hali ulangan guruh yo'q. Super Admindan ulanish kodini oling, botni guruhingizga admin qiling va guruhda <code>/link KOD</code> yuboring.");
    return openPanelButton(chatId, '📱 <b>Admin paneli</b>', '/', '📱 Panelni ochish');
  }

  if (cmd === '/explain') {
    if (!arg) return sendMessage(chatId, "Ingliz tilidagi jumlani yozing: <code>/explain She has been working here since 2020</code>");
    if (!rateOk(`ex:${from.id}`, 5, 10 * 60 * 1000)) return sendMessage(chatId, "Juda ko'p so'rov. Birozdan keyin urinib ko'ring.");
    try {
      return sendMessage(chatId, `📖 ${esc(await explainGrammar(arg))}`);
    } catch {
      return sendMessage(chatId, "Hozir tushuntirib bo'lmadi, keyinroq urinib ko'ring.");
    }
  }

  if (cmd === '/start') {
    if (arg.startsWith('review_')) {
      return sendMessage(chatId, await reviewText(arg.slice(7), String(from.id)));
    }
    if (/^QZ-/i.test(arg)) {
      return sendMessage(chatId, "Kod qabul qilindi, lekin ulash uchun uni <b>guruhingizda</b> yuboring:\n1) Botni guruhga qo'shing va admin qiling\n2) Guruhda yozing: <code>/link " + esc(arg.toUpperCase()) + "</code>");
    }
    const groups = await groupsOfAdmin(String(from.id));
    const owner = isOwnerId(from.id);
    let txt = `👋 Assalomu alaykum, <b>${esc(displayName(from))}</b>!\nMen guruhlar uchun AI viktorina botiman.`;
    if (groups.length) return openPanelButton(chatId, txt + '\n\nBoshqaruv paneli quyida:', '/', '📱 Panelni ochish');
    txt += "\n\nGuruhingizni ulash uchun Super Admindan <b>ulanish kodi</b> oling, botni guruhga admin qiling va guruhda <code>/link KOD</code> yuboring.";
    if (owner) txt += '\n\nSuper Admin paneli: /owner';
    return sendMessage(chatId, txt);
  }
}

// ------------------------------------------------------------------ onboarding
async function onLink(m: any, codeArg: string) {
  const chat = m.chat;
  const from = m.from;
  const reply = (t: string) => sendMessage(chat.id, t, { reply_parameters: { message_id: m.message_id } });
  const code = codeArg.trim().toUpperCase();
  if (!/^QZ-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return reply("Format: <code>/link QZ-XXXX-XXXX</code>");

  // Brute-force guard: 5 failures per user per hour.
  const bfKey = `bf/${from.id}`;
  const bf = (await getJSON<{ n: number; at: number }>(bfKey)) || { n: 0, at: Date.now() };
  if (Date.now() - bf.at > 3600 * 1000) { bf.n = 0; bf.at = Date.now(); }
  if (bf.n >= 5) return reply("Juda ko'p noto'g'ri urinish. 1 soatdan keyin qayta urinib ko'ring.");
  const fail = async (t: string) => {
    bf.n++;
    await setJSON(bfKey, bf);
    return reply(t);
  };

  const codes = (await getJSON<(AdminCodeRecord & { hash: string })[]>('codes')) || [];
  const rec = codes.find(c => c.hash === hashCode(code));
  if (!rec || rec.revoked || rec.used || new Date(rec.expiresAt).getTime() < Date.now()) return fail("❌ Kod noto'g'ri, muddati o'tgan yoki ishlatilgan.");

  if (!(await isChatAdmin(chat.id, from.id))) return fail("❌ Faqat guruh admini (yoki egasi) guruhni ulay oladi.");
  const meId = await botId();
  const me = await tg<{ status: string }>('getChatMember', { chat_id: chat.id, user_id: meId });
  if (!me.ok || me.result?.status !== 'administrator') return reply("❗ Avval botni shu guruhda <b>admin</b> qiling (xabarlarni o'chirish, a'zolarni cheklash, taklif qilish huquqlari bilan), so'ng qayta yuboring.");

  const existing = await getGroup(String(chat.id));
  if (existing && existing.status !== 'inactive') return reply("Bu guruh allaqachon ulangan.");

  const count = await tg<number>('getChatMemberCount', { chat_id: chat.id });
  const group = newGroup({
    chatId: String(chat.id),
    title: chat.title || rec.groupTitle,
    username: chat.username ? '@' + chat.username : undefined,
    adminId: String(from.id),
    adminName: displayName(from),
    memberCount: count.result || 0,
    plan: rec.plan,
  });
  await saveGroup(group);
  await addGroupToAdmin(String(from.id), group.id);
  rec.used = true;
  rec.usedBy = displayName(from);
  rec.usedAt = new Date().toISOString();
  await setJSON('codes', codes);
  await audit(displayName(from), 'GURUH_ULANDI', `«${group.title}» guruhi ulandi`, group.id);

  await reply("✅ Guruh muvaffaqiyatli ulandi! Boshqaruv paneli uchun botga shaxsiy chatda /panel yozing.");
  await sendMessage(from.id, `✅ «<b>${esc(group.title)}</b>» guruhi ulandi.`, {}).catch(() => {});
  await openPanelButton(from.id, "📱 Boshqaruv paneli tayyor. Quiz yaratish uchun oching:", '/', '📱 Panelni ochish').catch(() => {});
  for (const id of SUPER_ADMIN_IDS()) await sendMessage(id, `🔔 Yangi admin ulandi: <b>${esc(displayName(from))}</b> — «${esc(group.title)}»`);
}

async function onStopCmd(m: any) {
  const g = await getGroup(String(m.chat.id));
  if (!g || !g.runningQuizId) return;
  if (!(await isChatAdmin(m.chat.id, m.from.id))) return;
  await stopQuiz(g.runningQuizId);
}

async function onExplain(m: any, arg: string) {
  const g = await getGroup(String(m.chat.id));
  if (!g || g.status !== 'active' || !g.settings.explainEnabled) return;
  const sentence = (m.reply_to_message?.text || arg || '').trim();
  if (!sentence) return sendMessage(m.chat.id, "Ingliz tilidagi xabarga javob tarzida <code>/explain</code> yozing.", { reply_parameters: { message_id: m.message_id } });
  if (!rateOk(`ex:${m.from.id}`, 3, 10 * 60 * 1000) || !rateOk(`exg:${g.id}`, 20, 60 * 60 * 1000)) return;
  try {
    await sendMessage(m.chat.id, `📖 ${esc(await explainGrammar(sentence))}`, { reply_parameters: { message_id: m.message_id } });
  } catch {
    /* silent */
  }
}

// ------------------------------------------------------------------ membership
async function onJoinRequest(r: any) {
  const g = await getGroup(String(r.chat.id));
  if (!g || g.status !== 'active' || !g.settings.autoApproveJoin) return;
  const ok = await tg('approveChatJoinRequest', { chat_id: r.chat.id, user_id: r.from.id });
  if (ok.ok && g.settings.welcomeEnabled) await welcome(g.tgChatId, g.title, g.settings.welcomeMessage, g.settings.rules, r.from);
}

async function onNewMembers(m: any) {
  const g = await cachedGroup(String(m.chat.id));
  if (!g || g.status !== 'active' || !g.settings.welcomeEnabled) return;
  for (const u of m.new_chat_members.filter((x: any) => !x.is_bot).slice(0, 3)) {
    await welcome(g.tgChatId, g.title, g.settings.welcomeMessage, g.settings.rules, u);
  }
}

async function welcome(chatId: string, title: string, template: string, rules: string, user: any) {
  const name = `<a href="tg://user?id=${user.id}">${esc(displayName(user))}</a>`;
  let text = esc(template).replace(/\{name\}/g, name).replace(/\{group\}/g, esc(title));
  if (rules.trim()) text += `\n\n📜 <b>Qoidalar:</b>\n${esc(rules)}`;
  await sendMessage(chatId, text.slice(0, 3900));
}

async function onMyChatMember(u: any) {
  const g = await getGroup(String(u.chat.id));
  if (!g) return;
  const st = u.new_chat_member?.status;
  const botIsMe = String(u.new_chat_member?.user?.id) === String(await botId());
  if (!botIsMe) return;
  if (st === 'left' || st === 'kicked' || st === 'member' || st === 'restricted') {
    if (g.status === 'active') {
      g.status = 'inactive';
      await saveGroup(g);
      await audit('Tizim', 'BOT_OLIB_TASHLANDI', `Bot «${g.title}» guruhidan olib tashlandi yoki admin huquqi olindi`, g.id);
      const msg = `⚠️ Bot «${esc(g.title)}» guruhida admin emas yoki olib tashlandi. Guruh faol emas deb belgilandi. Botni qayta admin qiling va /link kodi bilan qayta ulang.`;
      await sendMessage(g.adminId, msg);
      for (const id of SUPER_ADMIN_IDS()) await sendMessage(id, msg);
    }
  } else if (st === 'administrator' && g.status === 'inactive') {
    g.status = 'active';
    await saveGroup(g);
  }
}

// ------------------------------------------------------------------ moderation
const LINK_RE = /(https?:\/\/|www\.|t\.me\/|telegram\.me\/|@[a-z][\w]{4,})/i;

async function logMod(gid: string, e: Omit<ModerationLog, 'id' | 'timestamp'>) {
  const list = (await getJSON<ModerationLog[]>(`mod/${gid}`)) || [];
  list.unshift({ id: uid('mod'), timestamp: new Date().toISOString(), ...e });
  await setJSON(`mod/${gid}`, list.slice(0, 100));
}

async function onModerate(m: any) {
  if (!m.text && !m.caption && !m.forward_origin) return;
  const g = await cachedGroup(String(m.chat.id));
  if (!g || g.status !== 'active' || !g.settings.antiSpamEnabled) return;
  const s = g.settings;
  const text: string = m.text || m.caption || '';
  let reason = '';
  if (s.filterLinks && LINK_RE.test(text)) reason = 'Ruxsatsiz havola';
  else if (s.filterForwards && (m.forward_origin || m.forward_date)) reason = 'Qayta yuborilgan xabar (forward)';
  else {
    const low = text.toLowerCase();
    const w = s.bannedWords.find(x => x && low.includes(x.toLowerCase()));
    if (w) reason = `Taqiqlangan so'z («${w}»)`;
  }
  if (!reason) return;
  if (await isChatAdmin(m.chat.id, m.from.id)) return; // never act against admins

  await tg('deleteMessage', { chat_id: m.chat.id, message_id: m.message_id });
  const wk = `warn/${g.id}/${m.from.id}`;
  const n = Number(await getJSON<number>(wk)) || 0;
  const name = displayName(m.from);
  if (n + 1 >= 3) {
    await tg('restrictChatMember', { chat_id: m.chat.id, user_id: m.from.id, permissions: { can_send_messages: false }, until_date: Math.floor(Date.now() / 1000) + 86400 });
    await setJSON(wk, 0);
    await logMod(g.id, { userId: String(m.from.id), userName: name, action: 'mute', reason: `${reason} (3-ogohlantirish, 24 soat mute)` });
    await sendMessage(m.chat.id, `🔇 <a href="tg://user?id=${m.from.id}">${esc(name)}</a> 24 soatga cheklandi (3 marta qoida buzildi).`);
  } else {
    await setJSON(wk, n + 1);
    await logMod(g.id, { userId: String(m.from.id), userName: name, action: 'spam_tozalandi', reason });
    await sendMessage(m.chat.id, `⚠️ <a href="tg://user?id=${m.from.id}">${esc(name)}</a>, xabaringiz o'chirildi: ${esc(reason)}. Ogohlantirish: ${n + 1}/3`);
  }
}

async function onModCommand(m: any, cmd: string) {
  const g = await getGroup(String(m.chat.id));
  if (!g || g.status !== 'active') return;
  const target = m.reply_to_message?.from;
  if (!target || !(await isChatAdmin(m.chat.id, m.from.id))) return;
  if (await isChatAdmin(m.chat.id, target.id)) return;
  const name = displayName(target);
  if (cmd === '/ban') {
    const r = await tg('banChatMember', { chat_id: m.chat.id, user_id: target.id });
    if (r.ok) {
      await logMod(g.id, { userId: String(target.id), userName: name, action: 'ban', reason: `${displayName(m.from)} tomonidan /ban` });
      await sendMessage(m.chat.id, `🚫 ${esc(name)} guruhdan chiqarildi.`);
    }
  } else {
    const wk = `warn/${g.id}/${target.id}`;
    const n = (Number(await getJSON<number>(wk)) || 0) + 1;
    await setJSON(wk, n >= 3 ? 0 : n);
    await logMod(g.id, { userId: String(target.id), userName: name, action: 'ogohlantirish', reason: `${displayName(m.from)} tomonidan /warn` });
    if (n >= 3) await tg('restrictChatMember', { chat_id: m.chat.id, user_id: target.id, permissions: { can_send_messages: false }, until_date: Math.floor(Date.now() / 1000) + 86400 });
    await sendMessage(m.chat.id, `⚠️ ${esc(name)} ogohlantirildi (${Math.min(n, 3)}/3)${n >= 3 ? ' va 24 soatga cheklandi' : ''}.`);
  }
}

export async function setupBot(origin: string, secret: string) {
  await setText('cfg/site', origin);
  const hook = await tg('setWebhook', {
    url: `${origin}/bot/webhook`,
    secret_token: secret,
    allowed_updates: ['message', 'poll', 'poll_answer', 'chat_join_request', 'my_chat_member'],
    drop_pending_updates: true,
  });
  await tg('setMyCommands', {
    commands: [
      { command: 'start', description: 'Botni boshlash' },
      { command: 'panel', description: 'Admin panelini ochish' },
      { command: 'explain', description: 'Ingliz tili jumlasini tushuntirish' },
    ],
  });
  await tg('setMyCommands', {
    scope: { type: 'all_chat_administrators' },
    commands: [
      { command: 'link', description: 'Guruhni kod bilan ulash' },
      { command: 'stop', description: "Davom etayotgan quizni to'xtatish" },
      { command: 'warn', description: 'Ogohlantirish (xabarga javob)' },
      { command: 'ban', description: 'Chiqarib yuborish (xabarga javob)' },
      { command: 'explain', description: 'Jumlani tushuntirish (xabarga javob)' },
    ],
  });
  await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Panel', web_app: { url: origin + '/' } } });
  // Owner gets a private menu button that opens the separate Super Admin window.
  for (const id of SUPER_ADMIN_IDS()) {
    await tg('setChatMenuButton', { chat_id: Number(id), menu_button: { type: 'web_app', text: 'Super Admin', web_app: { url: origin + '/owner.html' } } });
  }
  return { ok: hook.ok, description: hook.description, username: await botUsername() };
}

