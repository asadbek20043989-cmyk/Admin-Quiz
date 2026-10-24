// Thin wrapper around the Telegram WebApp SDK (loaded from telegram.org in the HTML head).
declare global {
  interface Window {
    Telegram?: { WebApp?: any };
  }
}

export const webApp = () => window.Telegram?.WebApp;
export const initData = () => webApp()?.initData || '';
export const insideTelegram = () => !!initData();

export function initTelegram() {
  const w = webApp();
  if (!w) return;
  try {
    w.ready();
    w.expand();
    w.setHeaderColor?.('#020617');
    w.setBackgroundColor?.('#020617');
    w.disableVerticalSwipes?.();
  } catch {
    /* older clients */
  }
}

export const haptic = (kind: 'success' | 'error' | 'light' = 'light') => {
  const h = webApp()?.HapticFeedback;
  if (!h) return;
  if (kind === 'light') h.impactOccurred?.('light');
  else h.notificationOccurred?.(kind);
};

export function confirmAction(message: string): Promise<boolean> {
  const w = webApp();
  if (w?.showConfirm) return new Promise(res => w.showConfirm(message, (ok: boolean) => res(!!ok)));
  return Promise.resolve(window.confirm(message));
}

export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
