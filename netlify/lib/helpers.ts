import { randomBytes } from 'node:crypto';
import type { GroupRecord, HelperInvite, HelperPerm } from '../../src/types/index.ts';
import { MAX_HELPERS } from '../../src/types/index.ts';
import { addGroupToAdmin, audit, del, getGroup, getJSON, removeGroupFromUser, saveGroup, setJSON } from './db.ts';
import { cleanPerms } from './access.ts';
import { displayName } from './auth.ts';
import { tg } from './tg.ts';

const INVITE_TTL_MS = 48 * 3600 * 1000;
type TgLike = { id: number | string; first_name?: string; last_name?: string; username?: string };

interface InviteRec extends HelperInvite {
  groupId: string;
  createdBy: string;
  used: boolean;
}

export const listInvites = async (groupId: string): Promise<HelperInvite[]> => {
  const list = (await getJSON<HelperInvite[]>(`ginv/${groupId}`)) || [];
  return list.filter(i => new Date(i.expiresAt).getTime() > Date.now());
};

export async function createInvite(g: GroupRecord, perms: HelperPerm[], createdBy: string): Promise<{ ok: boolean; error?: string; code?: string }> {
  const p = cleanPerms(perms);
  if (!p.length) return { ok: false, error: 'Kamida bitta vakolat tanlang' };
  const active = await listInvites(g.id);
  if ((g.helpers?.length || 0) + active.length >= MAX_HELPERS + 5) return { ok: false, error: "Faol takliflar juda ko'p. Avval eskilarini bekor qiling." };
  const code = randomBytes(9).toString('base64url');
  const now = Date.now();
  const rec: InviteRec = { code, perms: p, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + INVITE_TTL_MS).toISOString(), groupId: g.id, createdBy, used: false };
  await setJSON(`inv/${code}`, rec);
  await setJSON(`ginv/${g.id}`, [{ code, perms: p, createdAt: rec.createdAt, expiresAt: rec.expiresAt }, ...active].slice(0, 20));
  return { ok: true, code };
}

export async function revokeInvite(groupId: string, code: string) {
  await del(`inv/${code}`);
  const list = (await getJSON<HelperInvite[]>(`ginv/${groupId}`)) || [];
  await setJSON(`ginv/${groupId}`, list.filter(i => i.code !== code));
}

// Foydalanuvchi guruh a'zosimi? (yordamchi sifatida faqat guruh a'zosi qo'shila oladi)
async function isMember(chatId: string, userId: string | number): Promise<boolean> {
  const r = await tg<{ status: string; is_member?: boolean }>('getChatMember', { chat_id: chatId, user_id: Number(userId) });
  if (!r.ok || !r.result) return false;
  const st = r.result.status;
  return st === 'creator' || st === 'administrator' || st === 'member' || (st === 'restricted' && r.result.is_member !== false);
}

export async function addHelper(g: GroupRecord, user: TgLike, perms: HelperPerm[], actor: string): Promise<{ ok: boolean; error?: string }> {
  const uid = String(user.id);
  const p = cleanPerms(perms);
  if (!p.length) return { ok: false, error: 'Kamida bitta vakolat tanlang' };
  if (uid === g.adminId) return { ok: false, error: "Bu foydalanuvchi allaqachon guruh admini" };
  g.helpers = g.helpers || [];
  if (g.helpers.some(h => h.userId === uid)) return { ok: false, error: 'Bu foydalanuvchi allaqachon yordamchi' };
  if (g.helpers.length >= MAX_HELPERS) return { ok: false, error: `Yordamchi adminlar soni ${MAX_HELPERS} tadan oshmasligi kerak` };
  if (!(await isMember(g.tgChatId, uid))) return { ok: false, error: "Bu foydalanuvchi guruh a'zosi emas. Avval guruhga qo'shilishi kerak." };
  g.helpers.push({ userId: uid, name: displayName(user), username: user.username, perms: p, addedAt: new Date().toISOString() });
  await saveGroup(g);
  await addGroupToAdmin(uid, g.id);
  await audit(actor, 'YORDAMCHI_QOSHILDI', `${displayName(user)} «${g.title}» guruhiga yordamchi admin qilindi`, g.id);
  return { ok: true };
}

export async function removeHelper(g: GroupRecord, uid: string, actor: string): Promise<boolean> {
  const h = g.helpers?.find(x => x.userId === uid);
  if (!h) return false;
  g.helpers = (g.helpers || []).filter(x => x.userId !== uid);
  await saveGroup(g);
  await removeGroupFromUser(uid, g.id);
  await audit(actor, 'YORDAMCHI_OLIB_TASHLANDI', `${h.name} «${g.title}» yordamchilari ro'yxatidan chiqarildi`, g.id);
  return true;
}

// Taklif havolasi orqali (t.me/bot?start=helper_KOD) yordamchi bo'lish.
export async function redeemInvite(code: string, user: TgLike): Promise<{ ok: boolean; error?: string; group?: GroupRecord }> {
  const rec = await getJSON<InviteRec>(`inv/${code}`);
  if (!rec || rec.used || new Date(rec.expiresAt).getTime() < Date.now()) return { ok: false, error: "Taklif havolasi noto'g'ri, muddati o'tgan yoki ishlatilgan." };
  const g = await getGroup(rec.groupId);
  if (!g) return { ok: false, error: 'Guruh topilmadi.' };
  const r = await addHelper(g, user, rec.perms, displayName(user));
  if (!r.ok) return { ok: false, error: r.error };
  await revokeInvite(g.id, code);
  return { ok: true, group: g };
}
