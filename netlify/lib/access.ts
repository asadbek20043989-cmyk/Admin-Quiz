import type { GroupAccess, GroupRecord, GroupView, HelperPerm } from '../../src/types/index.ts';
import { HELPER_PERMS } from '../../src/types/index.ts';

export const ALL_PERMS: HelperPerm[] = HELPER_PERMS.map(p => p.id);

export const cleanPerms = (raw: unknown): HelperPerm[] =>
  Array.isArray(raw) ? ALL_PERMS.filter(p => raw.includes(p)) : [];

// Foydalanuvchining guruhdagi huquqi: guruh admini — hamma narsa, yordamchi — admin belgilagan vakolatlar.
export function accessOf(g: GroupRecord, userId: string | number): GroupAccess | null {
  const id = String(userId);
  if (g.adminId === id) return { role: 'admin', perms: ALL_PERMS };
  const h = g.helpers?.find(x => x.userId === id);
  return h ? { role: 'helper', perms: cleanPerms(h.perms) } : null;
}

// Yordamchilarga boshqa yordamchilar ro'yxati va ichki maydonlar ko'rsatilmaydi.
export function viewFor(g: GroupRecord, userId: string | number): GroupView | null {
  const access = accessOf(g, userId);
  if (!access) return null;
  const { helpers, adLog, ...rest } = g;
  return access.role === 'admin'
    ? ({ ...rest, helpers, access } as GroupView)
    : ({ ...rest, access } as GroupView);
}
