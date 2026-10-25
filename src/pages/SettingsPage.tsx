import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { BotHealth, CertificateTemplate, GroupRecord, HelperInviteRecord, HelperPerms, HelperRecord, ModerationLog } from '../types';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Spinner, Toggle, fmtDate, inputCls } from '../components/ui';
import { confirmAction, copyText } from '../lib/tg';
import { CertificateCanvas } from '../components/CertificateCanvas';

type Sub = 'group' | 'moderation' | 'cert' | 'auto' | 'helpers';
interface Props {
  group: GroupRecord;
  role: 'admin' | 'helper';
  perms: HelperPerms;
  onSaved: (g: GroupRecord) => void;
  toast: (m: string, ok?: boolean) => void;
}

export const SettingsPage: React.FC<Props> = props => {
  const { role, perms } = props;
  const tabs = ([
    ['group', 'Guruh', perms.settings],
    ['moderation', 'Moderatsiya', perms.moderation],
    ['cert', 'Sertifikat', perms.settings],
    ['auto', 'Avto-quiz', perms.auto],
    ['helpers', 'Yordamchilar', role === 'admin'],
  ] as [Sub, string, boolean][]).filter(t => t[2]);
  const [sub, setSub] = useState<Sub>(tabs[0]?.[0] || 'group');
  const current = tabs.some(t => t[0] === sub) ? sub : tabs[0]?.[0];
  if (!current) return <Empty text="Sizda sozlamalarga ruxsat yo'q." />;
  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl overflow-x-auto scrollbar-none">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} className={`flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer ${current === id ? 'bg-sky-500 text-white' : 'text-slate-400'}`}>{label}</button>
        ))}
      </div>
      {current === 'group' && <GroupTab {...props} />}
      {current === 'moderation' && <ModerationTab {...props} />}
      {current === 'cert' && <CertTab {...props} />}
      {current === 'auto' && <AutoTab {...props} />}
      {current === 'helpers' && <HelpersTab {...props} />}
    </div>
  );
};

type TabProps = Props;

const GroupTab: React.FC<TabProps> = ({ group, onSaved, toast }) => {
  const [s, setS] = useState(group.settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setS(group.settings), [group.id]);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.updateSettings(group.id, { autoApproveJoin: s.autoApproveJoin, welcomeEnabled: s.welcomeEnabled, welcomeMessage: s.welcomeMessage, rules: s.rules, explainEnabled: s.explainEnabled });
      onSaved(r.group);
      toast('Sozlamalar saqlandi');
    } catch (e: any) {
      toast(e.message, false);
    }
    setBusy(false);
  };
  return (
    <Card className="space-y-3">
      <Toggle checked={s.autoApproveJoin} onChange={v => setS({ ...s, autoApproveJoin: v })} label="Qo'shilish so'rovlarini avto-tasdiqlash" hint="Guruh 'so'rov bilan qo'shilish' rejimida bo'lsa" />
      <Toggle checked={s.welcomeEnabled} onChange={v => setS({ ...s, welcomeEnabled: v })} label="Salomlashish xabari" hint="Yangi a'zolarga guruhda salom yuboradi" />
      <Toggle checked={s.explainEnabled} onChange={v => setS({ ...s, explainEnabled: v })} label="/explain buyrug'i" hint="Xabarga javob tarzida AI tushuntirish" />
      <Field label="Salomlashish matni" hint="{name} — a'zo ismi, {group} — guruh nomi">
        <textarea rows={3} maxLength={1000} className={inputCls} value={s.welcomeMessage} onChange={e => setS({ ...s, welcomeMessage: e.target.value })} />
      </Field>
      <Field label="Guruh qoidalari">
        <textarea rows={4} maxLength={2000} className={inputCls} value={s.rules} onChange={e => setS({ ...s, rules: e.target.value })} />
      </Field>
      <Btn tone="primary" busy={busy} onClick={save} className="w-full">Saqlash</Btn>
    </Card>
  );
};

const ModerationTab: React.FC<TabProps> = ({ group, onSaved, toast }) => {
  const [s, setS] = useState(group.settings);
  const [words, setWords] = useState(group.settings.bannedWords.join(', '));
  const [logs, setLogs] = useState<ModerationLog[] | null>(null);
  const [health, setHealth] = useState<BotHealth | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setS(group.settings);
    setWords(group.settings.bannedWords.join(', '));
    api.moderation(group.id).then(r => setLogs(r.logs)).catch(() => setLogs([]));
    api.health(group.id).then(setHealth).catch(() => {});
  }, [group.id]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.updateSettings(group.id, { antiSpamEnabled: s.antiSpamEnabled, filterLinks: s.filterLinks, filterForwards: s.filterForwards, bannedWords: words.split(/[,\n]/).map(w => w.trim()).filter(Boolean) });
      onSaved(r.group);
      toast('Moderatsiya sozlamalari saqlandi');
    } catch (e: any) {
      toast(e.message, false);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      {health && health.problems.length > 0 && <ErrorBox message={`Bot huquqlari yetarli emas: ${health.problems.join('; ')}`} />}
      <Card className="space-y-3">
        <Toggle checked={s.antiSpamEnabled} onChange={v => setS({ ...s, antiSpamEnabled: v })} label="Anti-spam yoqilgan" hint="Qoidabuzar xabarlarni o'chiradi: 3 ogohlantirishdan keyin 24 soat mute. Adminlarga tegmaydi." />
        <Toggle checked={s.filterLinks} onChange={v => setS({ ...s, filterLinks: v })} label="Havolalar va @e'lonlarni o'chirish" />
        <Toggle checked={s.filterForwards} onChange={v => setS({ ...s, filterForwards: v })} label="Forward qilingan xabarlarni o'chirish" />
        <Field label="Taqiqlangan so'zlar" hint="Vergul bilan ajrating">
          <textarea rows={3} className={inputCls} value={words} onChange={e => setWords(e.target.value)} placeholder="kazino, 1xbet, tez boyish" />
        </Field>
        <Btn tone="primary" busy={busy} onClick={save} className="w-full">Saqlash</Btn>
        <p className="text-[11px] text-slate-500">Eslatma: anti-spam yoqilganda guruhdagi har bir xabar tekshiriladi. Katta faol guruhlarda bu Netlify funksiya chaqiruvlarini ko'paytiradi.</p>
        <p className="text-[11px] text-slate-500">Guruhda adminlar uchun: javob tarzida <code>/warn</code>, <code>/ban</code>.</p>
      </Card>
      <Card className="space-y-2">
        <h3 className="text-sm font-bold">Moderatsiya jurnali</h3>
        {logs === null ? <Spinner /> : logs.length === 0 ? <Empty text="Hali hech qanday amal bajarilmagan." /> : logs.slice(0, 30).map(l => (
          <div key={l.id} className="text-xs border-b border-slate-800 pb-2 last:border-0">
            <div className="flex items-center justify-between gap-2"><b className="text-slate-200 truncate">{l.userName}</b><Badge tone={l.action === 'ban' ? 'rose' : l.action === 'mute' ? 'amber' : 'slate'}>{l.action}</Badge></div>
            <div className="text-slate-400">{l.reason}</div>
            <div className="text-[10px] text-slate-600">{fmtDate(l.timestamp)}</div>
          </div>
        ))}
      </Card>
    </div>
  );
};

const CertTab: React.FC<TabProps> = ({ group, onSaved, toast }) => {
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [c, setC] = useState(group.certificateSettings);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.templates().then(setTemplates).catch(() => {});
  }, []);
  useEffect(() => setC(group.certificateSettings), [group.id]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.updateCert(group.id, c);
      onSaved(r.group);
      toast('Sertifikat sozlamalari saqlandi');
    } catch (e: any) {
      toast(e.message, false);
    }
    setBusy(false);
  };
  const today = new Date().toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h3 className="text-sm font-bold">Shablon</h3>
        <div className="grid grid-cols-1 gap-2">
          {templates.map(t => (
            <button key={t.id} onClick={() => setC({ ...c, templateId: t.id })} className={`text-left p-3 rounded-xl border cursor-pointer ${c.templateId === t.id ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 bg-slate-950'}`}>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: t.primaryColor }} /><b className="text-sm text-slate-100">{t.name}</b></div>
              <div className="text-[11px] text-slate-400 mt-0.5">{t.description}</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="G'oliblar soni"><input type="number" min={1} max={10} className={inputCls} value={c.winnersCount} onChange={e => setC({ ...c, winnersCount: Number(e.target.value) })} /></Field>
          <Field label="Imzo egasi lavozimi"><input className={inputCls} maxLength={60} value={c.signatoryTitle} onChange={e => setC({ ...c, signatoryTitle: e.target.value })} /></Field>
          <Field label="Imzo egasi ismi"><input className={inputCls} maxLength={60} value={c.signatoryName} onChange={e => setC({ ...c, signatoryName: e.target.value })} /></Field>
        </div>
        <Btn tone="primary" busy={busy} onClick={save} className="w-full">Saqlash</Btn>
        <p className="text-[11px] text-slate-500">O'rin olganlar (kamida 1 ta to'g'ri javob bilan) quiz tugashi bilan guruhda tabrik va sertifikat tugmasini avtomatik oladi. Oylik limit: {group.plan.certMonthlyUsed}/{group.plan.certMonthlyQuota}.</p>
      </Card>
      <Card className="space-y-2">
        <h3 className="text-sm font-bold">Ko'rinish (namuna)</h3>
        <CertificateCanvas templateId={c.templateId} recipientName="Aziza Karimova" rank={1} score={5} totalQuestions={5} groupTitle={group.title} date={today} signatoryTitle={c.signatoryTitle} signatoryName={c.signatoryName} certId="QZ-NAMUNA01" width={800} height={560} showDownloadBtn={false} />
      </Card>
    </div>
  );
};

// ------------------------------------------------------------------ automatic quizzes
const AutoTab: React.FC<TabProps> = ({ group, onSaved, toast }) => {
  const a0 = group.auto!;
  const max = group.plan.autoDailyMax;
  const [enabled, setEnabled] = useState(a0.enabled);
  const [times, setTimes] = useState<string[]>(a0.times);
  const [newTime, setNewTime] = useState('');
  const [count, setCount] = useState(a0.questionCount);
  const [seconds, setSeconds] = useState(a0.secondsPerQuestion);
  const [difficulty, setDifficulty] = useState(a0.difficulty);
  const [hint, setHint] = useState(a0.topicHint);
  const [busy, setBusy] = useState(false);

  const addTime = () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newTime)) return toast('Vaqtni tanlang', false);
    if (times.includes(newTime)) return toast('Bu vaqt qo\'shilgan', false);
    if (times.length >= max) return toast(`Kuniga ko'pi bilan ${max} ta`, false);
    setTimes([...times, newTime].sort());
    setNewTime('');
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.saveAuto(group.id, { enabled, times, questionCount: count, secondsPerQuestion: seconds, difficulty, topicHint: hint });
      onSaved(r.group);
      toast(enabled ? 'Avtomatik quizlar yoqildi ✅' : 'Saqlandi');
    } catch (e: any) {
      toast(e.message, false);
    }
    setBusy(false);
  };

  if (max === 0) return <Card><p className="text-sm text-slate-300">Avtomatik quiz hozircha yoqilmagan. Uni yoqish uchun Super Admin limit belgilashi kerak.</p></Card>;

  return (
    <Card className="space-y-3">
      <Toggle checked={enabled} onChange={setEnabled} label="Avtomatik quiz yuborish" hint={`Bot guruh nomi («${group.title}») bo'yicha mos fandan o'zi test tuzib yuboradi`} />
      <div>
        <span className="block text-xs font-semibold text-slate-300 mb-1">Yuborish vaqtlari (Toshkent vaqti)</span>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {times.length === 0 && <span className="text-xs text-slate-500">Hali vaqt qo'shilmagan</span>}
          {times.map(t => (
            <button key={t} onClick={() => setTimes(times.filter(x => x !== t))} className="px-3 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-bold cursor-pointer">{t} ✕</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="time" className={inputCls} value={newTime} onChange={e => setNewTime(e.target.value)} />
          <Btn onClick={addTime} disabled={times.length >= max}>Qo'shish</Btn>
        </div>
        <p className="text-[11px] text-slate-500 mt-1">Kuniga ko'pi bilan {max} ta (Super Admin belgilagan limit). Vaqtlar orasida kamida 20 daqiqa bo'lsin. Quiz belgilangan vaqtdan 5 daqiqagacha kechikib yuborilishi mumkin.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Savollar soni">
          <select className={inputCls} value={count} onChange={e => setCount(Number(e.target.value))}>
            {[3, 5, 7, 10, 15, 20].map(n => <option key={n} value={n}>{n} ta</option>)}
          </select>
        </Field>
        <Field label="Qiyinlik">
          <select className={inputCls} value={difficulty} onChange={e => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}>
            <option value="easy">Oson</option>
            <option value="medium">O'rta</option>
            <option value="hard">Qiyin</option>
          </select>
        </Field>
        <div className="col-span-2">
          <Field label="Har bir savol uchun vaqt (soniya)">
            <input type="number" min={5} max={600} className={inputCls} value={seconds || ''} onChange={e => setSeconds(Number(e.target.value))} onBlur={() => setSeconds(v => Math.max(5, Math.min(600, Math.round(v) || 30)))} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Fan yoki mavzu (ixtiyoriy)" hint="Bo'sh qoldirsangiz, bot guruh nomiga qarab mos fan va mavzuni o'zi tanlaydi.">
            <input className={inputCls} maxLength={80} value={hint} onChange={e => setHint(e.target.value)} placeholder="Masalan: Ingliz tili" />
          </Field>
        </div>
      </div>
      <Btn tone="primary" busy={busy} onClick={save} className="w-full">Saqlash</Btn>
      <p className="text-[11px] text-slate-500">Savollar yuborishdan oldin ikki marta mustaqil tekshiriladi. Ishonchli savol topilmasa, quiz yuborilmaydi va sizga xabar keladi.</p>
    </Card>
  );
};

// ------------------------------------------------------------------ helpers (assistant admins)
const PERM_LABELS: [keyof HelperPerms, string][] = [
  ['create', 'Quiz yaratish, yuborish va qayta boshlash'],
  ['control', "Quizni to'xtatish va o'chirish"],
  ['stats', "Statistikani ko'rish"],
  ['moderation', 'Moderatsiya'],
  ['settings', 'Guruh va sertifikat sozlamalari'],
  ['auto', 'Avtomatik quizlar'],
];
const NO_PERMS: HelperPerms = { create: false, control: false, stats: false, moderation: false, settings: false, auto: false };

const PermToggles: React.FC<{ perms: HelperPerms; onChange: (p: HelperPerms) => void }> = ({ perms, onChange }) => (
  <div className="space-y-0.5">
    {PERM_LABELS.map(([k, label]) => <Toggle key={k} checked={perms[k]} onChange={v => onChange({ ...perms, [k]: v })} label={label} />)}
  </div>
);

const HelpersTab: React.FC<TabProps> = ({ group, toast }) => {
  const [data, setData] = useState<{ helpers: HelperRecord[]; invites: HelperInviteRecord[]; limit: number } | null>(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<Record<string, HelperPerms>>({});
  const [label, setLabel] = useState('');
  const [perms, setPerms] = useState<HelperPerms>({ ...NO_PERMS, create: true, stats: true });
  const [created, setCreated] = useState<{ link: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.helpers(group.id).then(setData).catch(e => setError(e.message));
  useEffect(() => { load(); }, [group.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <Spinner />;
  const used = data.helpers.length + data.invites.length;

  const invite = async () => {
    setBusy(true);
    try {
      const r = await api.createInvite(group.id, { label: label.trim() || 'Yordamchi', perms });
      setCreated({ link: r.link, code: r.code });
      setLabel('');
      await load();
    } catch (e: any) {
      toast(e.message, false);
    }
    setBusy(false);
  };
  const savePerms = async (h: HelperRecord) => {
    try {
      await api.setHelperPerms(group.id, h.userId, edit[h.userId]);
      toast('Huquqlar saqlandi');
      setEdit(({ [h.userId]: _x, ...rest }) => rest);
      await load();
    } catch (e: any) {
      toast(e.message, false);
    }
  };
  const remove = async (h: HelperRecord) => {
    if (!(await confirmAction(`${h.name} yordamchilikdan olib tashlansinmi?`))) return;
    try {
      await api.removeHelper(group.id, h.userId);
      await load();
    } catch (e: any) {
      toast(e.message, false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Yordamchi adminlar</h3><Badge tone="sky">{used}/{data.limit}</Badge></div>
        {data.helpers.length === 0 && <Empty text="Hali yordamchi yo'q." />}
        {data.helpers.map(h => {
          const p = edit[h.userId] || h.perms;
          const dirty = !!edit[h.userId];
          return (
            <div key={h.userId} className="border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0"><div className="text-sm font-semibold truncate">{h.name}</div>{h.username && <div className="text-[11px] text-slate-500">@{h.username}</div>}</div>
                <Btn tone="danger" onClick={() => remove(h)}>Olib tashlash</Btn>
              </div>
              <PermToggles perms={p} onChange={np => setEdit({ ...edit, [h.userId]: np })} />
              {dirty && <Btn tone="primary" onClick={() => savePerms(h)} className="w-full">Huquqlarni saqlash</Btn>}
            </div>
          );
        })}
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-bold">Yangi yordamchi taklif qilish</h3>
        {used >= data.limit ? <p className="text-xs text-amber-300">Yordamchilar soni chegaraga yetdi (10 ta).</p> : (
          <>
            <Field label="Nom (eslatma uchun)"><input className={inputCls} maxLength={40} value={label} onChange={e => setLabel(e.target.value)} placeholder="Masalan: Dilshod" /></Field>
            <PermToggles perms={perms} onChange={setPerms} />
            <Btn tone="primary" busy={busy} onClick={invite} className="w-full">Taklif havolasini yaratish</Btn>
          </>
        )}
        {created && (
          <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-700/40 space-y-2">
            <p className="text-xs text-emerald-200">Havolani yordamchiga yuboring. U botni ochib «Start» bosadi va avtomatik qo'shiladi. Havola 24 soat amal qiladi va bir martalik.</p>
            <div className="text-[11px] font-mono break-all text-slate-200 bg-slate-950 p-2 rounded-lg">{created.link}</div>
            <Btn onClick={async () => toast((await copyText(created.link)) ? 'Nusxalandi' : "Nusxalab bo'lmadi, havolani qo'lda belgilang", true)} className="w-full">Havolani nusxalash</Btn>
          </div>
        )}
        {data.invites.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-300">Kutilayotgan takliflar</div>
            {data.invites.map(i => (
              <div key={i.id} className="flex items-center justify-between gap-2 text-xs border border-slate-800 rounded-xl p-2.5">
                <span className="truncate">{i.label} · {fmtDate(i.expiresAt)} gacha</span>
                <button onClick={async () => { await api.deleteInvite(group.id, i.id).catch(() => {}); load(); }} className="text-rose-400 font-bold cursor-pointer">Bekor</button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
