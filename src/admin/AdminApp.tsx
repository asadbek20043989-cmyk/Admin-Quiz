import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Bot, History, Settings, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import type { GroupRecord, MeResponse, QuizSummary } from '../types';
import { ErrorBox, Spinner, TelegramGate, useToast } from '../components/ui';
import { DashboardPage } from '../pages/DashboardPage';
import { QuizCreatorPage } from '../pages/QuizCreatorPage';
import { QuizHistoryPage } from '../pages/QuizHistoryPage';
import { StatsPage } from '../pages/StatsPage';
import { SettingsPage } from '../pages/SettingsPage';

type Tab = 'home' | 'new' | 'history' | 'stats' | 'settings';
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Bosh sahifa', icon: Bot },
  { id: 'new', label: 'Yangi quiz', icon: Sparkles },
  { id: 'history', label: 'Tarix', icon: History },
  { id: 'stats', label: 'Statistika', icon: BarChart3 },
  { id: 'settings', label: 'Sozlamalar', icon: Settings },
];

export function AdminApp() {
  return (
    <TelegramGate title="QuizBot — Admin paneli">
      <Panel />
    </TelegramGate>
  );
}

function Panel() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('home');
  const [groupId, setGroupId] = useState('');
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const toast = useToast();

  const loadMe = useCallback(async () => {
    try {
      const m = await api.me();
      setMe(m);
      setError('');
      setGroupId(cur => (m.groups.some(g => g.id === cur) ? cur : m.groups[0]?.id || ''));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const loadQuizzes = useCallback(async (gid: string) => {
    if (!gid) return;
    try {
      setQuizzes(await api.quizzes(gid));
    } catch {
      /* keep old list */
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);
  useEffect(() => {
    loadQuizzes(groupId);
  }, [groupId, loadQuizzes]);

  // While a quiz is running, refresh its status every 20 seconds (only while the panel is open).
  const running = quizzes.some(q => q.status === 'running');
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => loadQuizzes(groupId), 20000);
    return () => window.clearInterval(t);
  }, [running, groupId, loadQuizzes]);

  if (error && !me) return <div className="p-4"><ErrorBox message={error} onRetry={loadMe} /></div>;
  if (!me) return <Spinner label="Yuklanmoqda..." />;

  if (me.groups.length === 0) return <Onboarding botUsername={me.botUsername} />;

  const group = me.groups.find(g => g.id === groupId) || me.groups[0];
  const updateGroup = (g: GroupRecord) => setMe({ ...me, groups: me.groups.map(x => (x.id === g.id ? g : x)) });

  return (
    <div className="min-h-screen flex flex-col max-w-3xl mx-auto">
      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-extrabold text-sm text-white truncate">{group.title}</h1>
          <p className="text-[11px] text-slate-400">{group.memberCount.toLocaleString()} a'zo</p>
        </div>
        {me.groups.length > 1 && (
          <select
            value={group.id}
            onChange={e => setGroupId(e.target.value)}
            className="max-w-[45%] px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
          >
            {me.groups.map(g => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>
        )}
      </header>

      <main className="flex-1 p-4 pb-28 space-y-4">
        {tab === 'home' && <DashboardPage group={group} quizzes={quizzes} onNavigate={t => setTab(t as Tab)} onChanged={() => loadQuizzes(group.id)} toast={toast.show} />}
        {tab === 'new' && (
          <QuizCreatorPage
            group={group}
            onDone={() => {
              loadQuizzes(group.id);
              loadMe();
              setTab('home');
            }}
            toast={toast.show}
          />
        )}
        {tab === 'history' && <QuizHistoryPage quizzes={quizzes} onChanged={() => loadQuizzes(group.id)} toast={toast.show} />}
        {tab === 'stats' && <StatsPage group={group} />}
        {tab === 'settings' && <SettingsPage group={group} onSaved={updateGroup} toast={toast.show} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-3xl mx-auto grid grid-cols-5">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`py-2.5 flex flex-col items-center gap-0.5 text-[10px] font-semibold cursor-pointer ${active ? 'text-sky-400' : 'text-slate-500'}`}>
                <Icon className="w-5 h-5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
      {toast.node}
    </div>
  );
}

function Onboarding({ botUsername }: { botUsername: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="text-4xl">👋</div>
        <h1 className="text-lg font-extrabold text-white">Guruhingizni ulang</h1>
        <p className="text-sm text-slate-400">Sizda hali ulangan guruh yo'q. Ulash uchun:</p>
        <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
          <li>Super Admindan <b>ulanish kodini</b> oling (<code>QZ-XXXX-XXXX</code>).</li>
          <li>{botUsername ? <b>@{botUsername}</b> : 'Botni'} guruhingizga qo'shing va <b>admin</b> qiling (xabarlarni o'chirish, a'zolarni cheklash, taklif qilish huquqlari bilan).</li>
          <li>Guruhda yozing: <code>/link QZ-XXXX-XXXX</code></li>
          <li>Botga shaxsiy chatda <code>/panel</code> yozing — panel ochiladi.</li>
        </ol>
        <p className="text-[11px] text-slate-500">Kod 48 soat amal qiladi va faqat bir marta ishlatiladi. Faqat guruh admini ulay oladi.</p>
      </div>
    </div>
  );
}
