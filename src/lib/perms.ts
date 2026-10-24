import type { GroupView, HelperPerm } from '../types';

// Joriy foydalanuvchi shu guruhda ushbu amalni bajara oladimi? (server baribir qayta tekshiradi)
export const can = (g: GroupView, perm: HelperPerm) => g.access.role === 'admin' || g.access.perms.includes(perm);
