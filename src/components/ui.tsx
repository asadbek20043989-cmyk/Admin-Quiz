import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { initTelegram, insideTelegram } from '../lib/tg';

export const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-sky-500 placeholder:text-slate-600';

export const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className = '' }) => (
  <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 ${className}`}>{children}</div>
);

export const Spinner: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
    <Loader2 className="w-5 h-5 animate-spin" />
    {label && <span>{label}</span>}
  </div>
);

export const ErrorBox: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-700/50 text-rose-200 text-xs flex items-start gap-2.5">
    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
    <div className="flex-1">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="ml-2 underline font-semibold">
          Qayta urinish
        </button>
      )}
    </div>
  </div>
);

export const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="py-10 text-center text-sm text-slate-500">{text}</div>
);

type Tone = 'sky' | 'emerald' | 'amber' | 'rose' | 'slate' | 'indigo';
const tones: Record<Tone, string> = {
  sky: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  slate: 'bg-slate-700/40 text-slate-300 border-slate-600/50',
  indigo: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
};
export const Badge: React.FC<React.PropsWithChildren<{ tone?: Tone }>> = ({ tone = 'slate', children }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${tones[tone]}`}>{children}</span>
);

export const Btn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'ghost' | 'danger' | 'success'; busy?: boolean }
> = ({ tone = 'ghost', busy, children, className = '', disabled, ...rest }) => {
  const cls = {
    primary: 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20',
    ghost: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700',
    danger: 'bg-rose-950/70 hover:bg-rose-900/70 text-rose-300 border border-rose-800/50',
    success: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950',
  }[tone];
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 cursor-pointer ${cls} ${className}`}
    >
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
};

export const Field: React.FC<React.PropsWithChildren<{ label: string; hint?: string }>> = ({ label, hint, children }) => (
  <label className="block text-xs">
    <span className="block font-semibold text-slate-300 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
  </label>
);

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ checked, onChange, label, hint }) => (
  <button type="button" onClick={() => onChange(!checked)} className="w-full flex items-center justify-between gap-3 text-left py-2 cursor-pointer">
    <span>
      <span className="block text-sm font-semibold text-slate-200">{label}</span>
      {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
    </span>
    <span className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${checked ? 'bg-emerald-500' : 'bg-slate-700'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </span>
  </button>
);

export const Modal: React.FC<React.PropsWithChildren<{ title: string; onClose: () => void }>> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
    <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 space-y-4 shadow-2xl animate-slideUp" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-100">{title}</h3>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, ok = true) => {
    setMsg({ text, ok });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 4000);
  }, []);
  const node = msg ? (
    <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-sm z-[60] animate-slideUp">
      <div className={`p-3.5 rounded-2xl border text-xs font-semibold shadow-2xl flex items-start gap-2.5 ${msg.ok ? 'bg-emerald-950 border-emerald-600/50 text-emerald-100' : 'bg-rose-950 border-rose-600/50 text-rose-100'}`}>
        {msg.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
        <span className="leading-snug">{msg.text}</span>
      </div>
    </div>
  ) : null;
  return { show, node };
}

// Shared gate: the panels only work inside Telegram (identity comes from signed initData).
export const TelegramGate: React.FC<React.PropsWithChildren<{ title: string }>> = ({ title, children }) => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    initTelegram();
    setReady(true);
  }, []);
  if (!ready) return <Spinner />;
  if (!insideTelegram()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <div className="text-5xl">🤖</div>
          <h1 className="text-lg font-bold text-slate-100">{title}</h1>
          <p className="text-sm text-slate-400">Bu panel faqat Telegram ichida ishlaydi. Botga o'ting va menyudagi tugma orqali oching.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};

export const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
