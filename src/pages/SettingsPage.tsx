import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { BotHealth, CertificateTemplate, GroupRecord, ModerationLog } from '../types';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Spinner, Toggle, fmtDate, inputCls } from '../components/ui';
import { CertificateCanvas } from '../components/CertificateCanvas';

type Sub = 'group' | 'moderation' | 'cert';
interface Props {
  group: GroupRecord;
  onSaved: (g: GroupRecord) => void;
  toast: (m: string, ok?: boolean) => void;
}

export const SettingsPage: React.FC<Props> = ({ group, onSaved, toast }) => {
  const [sub, setSub] = useState<Sub>('group');
  const tabs: [Sub, string][] = [['group', 'Guruh'], ['moderation', 'Moderatsiya'], ['cert', 'Sertifikat']];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} className={`py-2 rounded-lg text-xs font-semibold cursor-pointer ${sub === id ? 'bg-sky-500 text-white' : 'text-slate-400'}`}>{label}</button>
        ))}
      </div>
      {sub === 'group' && <GroupTab group={group} onSaved={onSaved} toast={toast} />}
      {sub === 'moderation' && <ModerationTab group={group} onSaved={onSaved} toast={toast} />}
      {sub === 'cert' && <CertTab group={group} onSaved={onSaved} toast={toast} />}
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
