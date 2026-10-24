import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Megaphone, ScrollText, ShieldAlert, Users, LayoutDashboard, Copy, Check, Pause, Play, Trash2, Sliders, RotateCcw } from 'lucide-react';
import { api, ApiError, type OwnerOverview } from '../lib/api';
import { confirmAction, copyText, haptic } from '../lib/tg';
import type { AdRecord, AdminCodeRecord, AuditLogRecord, GroupRecord } from '../types';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Modal, Spinner, TelegramGate, fmtDate, inputCls, useToast } from '../components/ui';

type Tab = 'overview' | 'groups' | 'codes' | 'ads' | 'audit';
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Umumiy', icon: LayoutDashboard },
  { id: 'groups', label: 'Guruhlar', icon: Users },
  { id: 'codes', label: 'Kodlar', icon: KeyRound },
  { id: 'ads', label: 'Reklama', icon: Megaphone },
  { id: 'audit', label: 'Jurnal', icon: ScrollText },
];

export function OwnerApp() {
  return (
    <TelegramGate title="QuizBot — Super Admin">
      <Owner />
    </TelegramGate>
  );
}

function Owner() {
  const [tab, setTab] = useState<Tab>('overview');
  const [denied, setDenied] = useState(false);
  const toast = useToast();

  // Server-side check: anyone who is not in SUPER_ADMIN_IDS gets 403 here and sees nothing.
  useEffect(() => {
    api.ownerOverview().catch(e => e instanceof ApiError && (e.status === 403 || e.status === 401) && setDenied(true));
  }, []);

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="space-y-2"><ShieldAlert className="w-10 h-10 text-rose-400 mx-auto" /><h1 className="font-bold">Ruxsat yo'q</h1><p className="text-sm text-slate-400">Bu oyna faqat tizim egasi uchun.</p></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col max-w-3xl mx-auto">
      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-indigo-900/60 px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center"><ShieldAlert className="w-5 h-5 text-indigo-400" /></div>
        <div><h1 className="font-extrabold text-sm text-white">Super Admin</h1><p className="text-[11px] text-slate-400">Tizim egasi paneli</p></div>
      </header>
      <main className="flex-1 p-4 pb-28 space-y-4">
        {tab === 'overview' && <Overview toast={toast.show} />}
        {tab === 'groups' && <Groups toast={toast.show} />}
        {tab === 'codes' && <Codes toast={toast.show} />}
        {tab === 'ads' && <Ads toast={toast.show} />}
        {tab === 'audit' && <Audit />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-3xl mx-auto grid grid-cols-5">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`py-2.5 flex flex-col items-center gap-0.5 text-[10px] font-semibold cursor-pointer ${tab === t.id ? 'text-indigo-400' : 'text-slate-500'}`}>
                <Icon className="w-5 h-5" />{t.label}
              </button>
            );
          })}
        </div>
      </nav>
      {toast.node}
    </div>
  );
}

type T = { toast: (m: string, ok?: boolean) => void };

function useLoad<V>(fn: () => Promise<V>) {
  const [data, setData] = useState<V | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    fn().then(setData).catch(e => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  return { data, setData, error, reload: load };
}

// ------------------------------------------------------------------ overview
function Overview({ toast }: T) {
  const { data: o, error, reload } = useLoad<OwnerOverview>(api.ownerOverview);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!o) return <Spinner />;

  const setup = async () => {
    setBusy(true);
    try {
      const r = await api.ownerSetup();
      haptic('success');
      toast(`Bot ulandi: @${r.username}`);
      reload();
    } catch (e: any) {
      toast(e.message, false);
    }
    setBusy(false);
  };
  const broadcast = async () => {
    if (!msg.trim() || !(await confirmAction("Barcha guruh adminlariga e'lon yuborilsinmi?"))) return;
    setSending(true);
    try {
      const r = await api.ownerBroadcast(msg.trim());
      toast(`${r.sent}/${r.total} adminga yuborildi`);
      setMsg('');
    } catch (e: any) {
      toast(e.message, false);
    }
    setSending(false);
  };
  const webhookOk = !!o.webhook?.url && o.webhook.url.includes('/bot/webhook');
  const checks: [string, boolean][] = [['BOT_TOKEN', o.env.botToken], ['GEMINI_API_KEY', o.env.gemini], ['SUPER_ADMIN_IDS', o.env.owners > 0], ['Webhook ulangan', webhookOk]];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        {[['Guruhlar', `${o.activeGroups}/${o.groups}`], ["Jami a'zolar", o.members.toLocaleString()], ['Quizlar', o.quizzes], ['Sertifikatlar', o.certs], ['AI (bugun)', o.aiToday]].map(([l, v]) => (
          <Card key={String(l)} className="!p-3.5"><div className="text-xl font-extrabold text-white">{v}</div><div className="text-[11px] text-slate-400">{l}</div></Card>
        ))}
      </div>
      <Card className="space-y-3">
        <h3 className="text-sm font-bold">Tizim holati</h3>
        {checks.map(([l, ok]) => <div key={l} className="flex items-center justify-between text-xs"><span className="text-slate-300">{l}</span><Badge tone={ok ? 'emerald' : 'rose'}>{ok ? 'OK' : 'Yo\'q'}</Badge></div>)}
        {o.botUsername && <div className="text-xs text-slate-400">Bot: <b className="text-slate-200">@{o.botUsername}</b></div>}
        {o.webhook?.lastError && <ErrorBox message={`Telegram oxirgi xatosi: ${o.webhook.lastError}`} />}
        {o.webhook && <div className="text-[11px] text-slate-500">Kutilayotgan yangilanishlar: {o.webhook.pending}</div>}
        <Btn tone="primary" busy={busy} onClick={setup} className="w-full">{webhookOk ? 'Webhook va buyruqlarni qayta o\'rnatish' : '🔌 Botni ulash (webhook)'}</Btn>
        <p className="text-[11px] text-slate-500">Birinchi deploydan keyin bir marta bosing. Bu bot webhook'ini, buyruqlar ro'yxatini va menyu tugmalarini o'rnatadi.</p>
      </Card>
      <Card className="space-y-2">
        <h3 className="text-sm font-bold">Barcha adminlarga e'lon</h3>
        <textarea rows={3} maxLength={3500} className={inputCls} value={msg} onChange={e => setMsg(e.target.value)} placeholder="Xabar matni..." />
        <Btn busy={sending} onClick={broadcast} className="w-full">Yuborish</Btn>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ groups
function Groups({ toast }: T) {
  const { data: groups, setData, error, reload } = useLoad<GroupRecord[]>(api.ownerGroups);
  const [edit, setEdit] = useState<GroupRecord | null>(null);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!groups) return <Spinner />;
  if (!groups.length) return <Empty text="Hali guruh ulanmagan. «Kodlar» bo'limida kod yarating." />;

  const toggle = async (g: GroupRecord) => {
    const next = g.status === 'active' ? "to'xtatilsinmi? (davom etayotgan quiz ham to'xtatiladi)" : 'qayta faollashtirilsinmi?';
    if (!(await confirmAction(`«${g.title}» ${next}`))) return;
    try {
      const r = await api.ownerToggle(g.id);
      setData(groups.map(x => (x.id === g.id ? { ...x, status: r.status as GroupRecord['status'] } : x)));
    } catch (e: any) {
      toast(e.message, false);
    }
  };
  const reset = async (g: GroupRecord) => {
    if (!(await confirmAction(`«${g.title}» statistikasi butunlay nollansinmi?`))) return;
    try {
      await api.ownerResetStats(g.id);
      toast('Statistika nollandi');
    } catch (e: any) {
      toast(e.message, false);
    }
  };

  return (
    <div className="space-y-3">
      {groups.map(g => (
        <Card key={g.id} className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><div className="font-bold text-sm truncate">{g.title}</div><div className="text-[11px] text-slate-400">Admin: {g.adminName} · {g.memberCount.toLocaleString()} a'zo</div></div>
            <Badge tone={g.status === 'active' ? 'emerald' : g.status === 'suspended' ? 'amber' : 'rose'}>{g.status === 'active' ? 'Faol' : g.status === 'suspended' ? "To'xtatilgan" : 'Nofaol'}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800"><span className="text-slate-400 block text-[10px]">AI (kunlik)</span><b>{g.plan.aiDailyUsed}/{g.plan.aiDailyQuota}</b></div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800"><span className="text-slate-400 block text-[10px]">Sertifikat (oylik)</span><b>{g.plan.certMonthlyUsed}/{g.plan.certMonthlyQuota}</b></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => setEdit(g)}><Sliders className="w-3.5 h-3.5" /> Limitlar</Btn>
            <Btn tone={g.status === 'active' ? 'danger' : 'success'} onClick={() => toggle(g)}>{g.status === 'active' ? <><Pause className="w-3.5 h-3.5" /> To'xtatish</> : <><Play className="w-3.5 h-3.5" /> Faollashtirish</>}</Btn>
            <Btn onClick={() => reset(g)}><RotateCcw className="w-3.5 h-3.5" /> Statistikani nollash</Btn>
          </div>
        </Card>
      ))}
      {edit && <LimitsModal group={edit} onClose={() => setEdit(null)} onSaved={g => { setData(groups.map(x => (x.id === g.id ? g : x))); setEdit(null); toast('Limitlar saqlandi'); }} toast={toast} />}
    </div>
  );
}

function LimitsModal({ group, onClose, onSaved, toast }: { group: GroupRecord; onClose: () => void; onSaved: (g: GroupRecord) => void; toast: T['toast'] }) {
  const [ai, setAi] = useState(group.plan.aiDailyQuota);
  const [cert, setCert] = useState(group.plan.certMonthlyQuota);
  const [adMin, setAdMin] = useState(group.plan.adMinPerWeek);
  const [adMax, setAdMax] = useState(group.plan.adMaxPerWeek);
  const [adFree, setAdFree] = useState(group.settings.adFree);
  const save = async () => {
    try {
      await api.ownerLimits(group.id, { aiDailyQuota: ai, certMonthlyQuota: cert, adMinPerWeek: adMin, adMaxPerWeek: adMax, adFree });
      onSaved({ ...group, plan: { ...group.plan, aiDailyQuota: ai, certMonthlyQuota: cert, adMinPerWeek: adMin, adMaxPerWeek: Math.max(adMin, adMax) }, settings: { ...group.settings, adFree } });
    } catch (e: any) {
      toast(e.message, false);
    }
  };
  const n = (v: number, set: (x: number) => void) => <input type="number" min={0} className={inputCls} value={v} onChange={e => set(Number(e.target.value))} />;
  return (
    <Modal title={`Limitlar: ${group.title}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="AI (kunlik)">{n(ai, setAi)}</Field>
        <Field label="Sertifikat (oylik)">{n(cert, setCert)}</Field>
        <Field label="Reklama min/hafta">{n(adMin, setAdMin)}</Field>
        <Field label="Reklama max/hafta">{n(adMax, setAdMax)}</Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={adFree} onChange={e => setAdFree(e.target.checked)} className="accent-sky-500 w-4 h-4" /> Reklamasiz tarif</label>
      <div className="flex justify-end gap-2"><Btn onClick={onClose}>Bekor</Btn><Btn tone="primary" onClick={save}>Saqlash</Btn></div>
    </Modal>
  );
}

// ------------------------------------------------------------------ codes
function Codes({ toast }: T) {
  const { data: codes, setData, error, reload } = useLoad<AdminCodeRecord[]>(api.ownerCodes);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [ai, setAi] = useState(20);
  const [cert, setCert] = useState(200);
  const [adMin, setAdMin] = useState(2);
  const [created, setCreated] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!codes) return <Spinner />;

  const create = async () => {
    if (!title.trim()) return toast('Guruh nomini kiriting', false);
    setBusy(true);
    try {
      const r = await api.ownerCreateCode({ groupTitle: title.trim(), aiDailyQuota: ai, certMonthlyQuota: cert, adMinPerWeek: adMin });
      setCreated(r.code);
      setData([r.codeRecord, ...codes]);
      setTitle('');
      haptic('success');
    } catch (e: any) {
      toast(e.message, false);
    }
    setBusy(false);
  };
  const revoke = async (c: AdminCodeRecord) => {
    if (!(await confirmAction('Kod bekor qilinsinmi?'))) return;
    try {
      await api.ownerRevokeCode(c.id);
      setData(codes.map(x => (x.id === c.id ? { ...x, revoked: true } : x)));
    } catch (e: any) {
      toast(e.message, false);
    }
  };
  const state = (c: AdminCodeRecord) => (c.revoked ? ['Bekor qilingan', 'rose'] : c.used ? ['Ishlatilgan', 'emerald'] : new Date(c.expiresAt).getTime() < Date.now() ? ["Muddati o'tgan", 'slate'] : ['Faol', 'sky']) as [string, 'rose' | 'emerald' | 'slate' | 'sky'];

  return (
    <div className="space-y-4">
      <Btn tone="primary" className="w-full py-3.5" onClick={() => { setOpen(true); setCreated(''); }}><KeyRound className="w-4 h-4" /> Yangi ulanish kodi</Btn>
      {!codes.length && <Empty text="Hali kod yaratilmagan." />}
      {codes.map(c => {
        const [label, tone] = state(c);
        return (
          <Card key={c.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2"><b className="text-sm truncate">{c.groupTitle}</b><Badge tone={tone}>{label}</Badge></div>
            <div className="text-xs text-slate-400 font-mono">{c.hint}</div>
            <div className="text-[11px] text-slate-500">Yaratilgan: {fmtDate(c.createdAt)} · Amal qiladi: {fmtDate(c.expiresAt)}{c.used && ` · Ulagan: ${c.usedBy}`}</div>
            {!c.used && !c.revoked && new Date(c.expiresAt).getTime() > Date.now() && <Btn tone="danger" onClick={() => revoke(c)}><Trash2 className="w-3.5 h-3.5" /> Bekor qilish</Btn>}
          </Card>
        );
      })}

      {open && (
        <Modal title="Yangi ulanish kodi" onClose={() => setOpen(false)}>
          {created ? (
            <div className="space-y-3 text-center">
              <p className="text-xs text-amber-300">Kod faqat hozir ko'rsatiladi. Nusxa oling va guruh adminiga yuboring.</p>
              <div className="text-2xl font-mono font-extrabold tracking-wider text-white bg-slate-950 border border-slate-700 rounded-2xl py-4">{created}</div>
              <Btn tone="primary" className="w-full" onClick={async () => { await copyText(created); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? <><Check className="w-4 h-4" /> Nusxalandi</> : <><Copy className="w-4 h-4" /> Nusxa olish</>}</Btn>
              <p className="text-[11px] text-slate-500">Admin botni guruhga qo'shib admin qiladi va guruhda <code>/link {created}</code> yuboradi. Kod 48 soat amal qiladi.</p>
            </div>
          ) : (
            <>
              <Field label="Guruh nomi (eslatma uchun)"><input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} maxLength={80} /></Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="AI/kun"><input type="number" min={0} className={inputCls} value={ai} onChange={e => setAi(Number(e.target.value))} /></Field>
                <Field label="Sertifikat/oy"><input type="number" min={0} className={inputCls} value={cert} onChange={e => setCert(Number(e.target.value))} /></Field>
                <Field label="Reklama/hafta"><input type="number" min={0} className={inputCls} value={adMin} onChange={e => setAdMin(Number(e.target.value))} /></Field>
              </div>
              <Btn tone="primary" busy={busy} onClick={create} className="w-full">Kod yaratish</Btn>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ ads
function Ads({ toast }: T) {
  const { data: ads, setData, error, reload } = useLoad<AdRecord[]>(api.ownerAds);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', text: '', imageUrl: '', buttonText: '', buttonUrl: '' });
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!ads) return <Spinner />;
  const create = async () => {
    try {
      const r = await api.ownerCreateAd(f);
      setData([r.ad, ...ads]);
      setOpen(false);
      setF({ title: '', text: '', imageUrl: '', buttonText: '', buttonUrl: '' });
      toast('Reklama yaratildi');
    } catch (e: any) {
      toast(e.message, false);
    }
  };
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value }) });
  return (
    <div className="space-y-3">
      <Btn tone="primary" className="w-full py-3.5" onClick={() => setOpen(true)}><Megaphone className="w-4 h-4" /> Yangi reklama</Btn>
      {!ads.length && <Empty text="Reklama yo'q." />}
      {ads.map(a => (
        <Card key={a.id} className="space-y-2">
          <div className="flex items-center justify-between gap-2"><b className="text-sm truncate">{a.title}</b><Badge tone={a.status === 'active' ? 'emerald' : 'slate'}>{a.status === 'active' ? 'Faol' : 'Pauza'}</Badge></div>
          <div className="text-xs text-slate-400">{a.text}</div>
          <div className="text-[11px] text-slate-500">Guruhlarga chiqarilgan: {a.impressions} marta</div>
          <div className="flex gap-2">
            <Btn onClick={async () => { try { await api.ownerToggleAd(a.id); setData(ads.map(x => (x.id === a.id ? { ...x, status: x.status === 'active' ? 'paused' : 'active' } : x))); } catch (e: any) { toast(e.message, false); } }}>{a.status === 'active' ? 'Pauza' : 'Yoqish'}</Btn>
            <Btn tone="danger" onClick={async () => { if (!(await confirmAction("Reklama o'chirilsinmi?"))) return; try { await api.ownerDeleteAd(a.id); setData(ads.filter(x => x.id !== a.id)); } catch (e: any) { toast(e.message, false); } }}><Trash2 className="w-3.5 h-3.5" /></Btn>
          </div>
        </Card>
      ))}
      {open && (
        <Modal title="Yangi reklama" onClose={() => setOpen(false)}>
          <Field label="Nomi (faqat siz uchun, guruhda ko'rinmaydi)"><input className={inputCls} maxLength={100} {...bind('title')} /></Field>
          <Field label="Reklama matni *" hint="Guruhga aynan shu matn yuboriladi, boshqa hech qanday qo'shimcha yozuvsiz."><textarea rows={4} maxLength={900} className={inputCls} {...bind('text')} /></Field>
          <Field label="Rasm havolasi (https, ixtiyoriy)"><input className={inputCls} {...bind('imageUrl')} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tugma matni"><input className={inputCls} maxLength={40} {...bind('buttonText')} /></Field>
            <Field label="Tugma havolasi"><input className={inputCls} {...bind('buttonUrl')} /></Field>
          </div>
          <p className="text-[11px] text-slate-500">Reklama guruhlarga quiz natijalaridan keyin, faqat shu matn (rasm va tugma bilan yoki usiz) ko'rinishida yuboriladi.</p>
          <div className="flex justify-end gap-2"><Btn onClick={() => setOpen(false)}>Bekor</Btn><Btn tone="primary" onClick={create}>Yaratish</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ audit
function Audit() {
  const { data, error, reload } = useLoad<AuditLogRecord[]>(api.ownerAudit);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  if (!data.length) return <Empty text="Jurnal bo'sh." />;
  return (
    <div className="space-y-2">
      {data.slice(0, 100).map(l => (
        <Card key={l.id} className="!p-3 space-y-0.5">
          <div className="flex items-center justify-between gap-2"><Badge tone="indigo">{l.action}</Badge><span className="text-[10px] text-slate-500">{fmtDate(l.timestamp)}</span></div>
          <div className="text-xs text-slate-300">{l.details}</div>
          <div className="text-[10px] text-slate-500">{l.actor}</div>
        </Card>
      ))}
    </div>
  );
}
