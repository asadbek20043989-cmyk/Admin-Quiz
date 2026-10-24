import React, { useEffect, useState } from 'react';
import { AlertTriangle, Award, CalendarClock, Play, Sparkles, Square, Users } from 'lucide-react';
import { api } from '../lib/api';
import { confirmAction } from '../lib/tg';
import type { BotHealth, GroupView, QuizSummary } from '../types';
import { can } from '../lib/perms';
import { Badge, Btn, Card, Empty, fmtDate } from '../components/ui';

interface Props {
  group: GroupView;
  quizzes: QuizSummary[];
  onNavigate: (tab: string) => void;
  onChanged: () => void;
  toast: (m: string, ok?: boolean) => void;
}

export const DashboardPage: React.FC<Props> = ({ group, quizzes, onNavigate, onChanged, toast }) => {
  const [health, setHealth] = useState<BotHealth | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHealth(null);
    api.health(group.id).then(setHealth).catch(() => {});
  }, [group.id]);

  const runningQuiz = quizzes.find(q => q.status === 'running');
  const next = quizzes.filter(q => q.status === 'scheduled').sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''))[0];
  const last = quizzes.find(q => q.status === 'finished');
  const p = group.plan;

  const stop = async (id: string) => {
    if (!(await confirmAction("Quizni hozir to'xtatib, natijalarni e'lon qilaymi?"))) return;
    setBusy(true);
    try {
      await api.stopQuiz(id);
      toast("Quiz to'xtatildi, natijalar e'lon qilindi");
      onChanged();
    } catch (e: any) {
      toast(e.message, false);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      {group.status !== 'active' && (
        <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-700/50 text-rose-200 text-xs">
          {group.status === 'suspended'
            ? "Guruh Super Admin tomonidan to'xtatilgan. Quiz yuborib bo'lmaydi."
            : "Bot guruhda admin emas yoki olib tashlangan. Botni qayta admin qiling va /link kodi bilan qayta ulang."}
        </div>
      )}

      {health && health.problems.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-600/40 text-amber-200 text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold"><AlertTriangle className="w-4 h-4" /> Bot huquqlarida muammo</div>
          {health.problems.map(t => <div key={t}>• {t}</div>)}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <Card className="!p-3"><Users className="w-4 h-4 text-sky-400 mb-1" /><div className="text-lg font-extrabold">{group.memberCount.toLocaleString()}</div><div className="text-[10px] text-slate-400">A'zolar</div></Card>
        <Card className="!p-3"><Sparkles className="w-4 h-4 text-amber-400 mb-1" /><div className="text-lg font-extrabold">{p.aiDailyUsed}/{p.aiDailyQuota}</div><div className="text-[10px] text-slate-400">AI (bugun)</div></Card>
        <Card className="!p-3"><Award className="w-4 h-4 text-emerald-400 mb-1" /><div className="text-lg font-extrabold">{p.certMonthlyUsed}/{p.certMonthlyQuota}</div><div className="text-[10px] text-slate-400">Sertifikat (oy)</div></Card>
      </div>

      {runningQuiz && can(group, 'quiz') && (
        <Card className="!border-emerald-600/50 space-y-2">
          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /><b className="text-sm text-emerald-300">Quiz davom etmoqda</b></div>
          <div className="text-sm text-slate-200">{runningQuiz.topic} · {runningQuiz.questionCount} ta savol</div>
          <Btn tone="danger" busy={busy} onClick={() => stop(runningQuiz.id)}><Square className="w-3.5 h-3.5" /> To'xtatish va natijalarni e'lon qilish</Btn>
        </Card>
      )}

      {can(group, 'quiz') ? (
        <div className="grid grid-cols-2 gap-2.5">
          <Btn tone="primary" onClick={() => onNavigate('new')} className="py-3.5"><Play className="w-4 h-4" /> Yangi quiz</Btn>
          <Btn onClick={() => onNavigate('history')} className="py-3.5">Tarix va natijalar</Btn>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">Siz yordamchi adminsiz. Mavjud bo'limlar pastdagi menyuda ko'rinadi.</div>
      )}

      <Card className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-300"><CalendarClock className="w-4 h-4 text-sky-400" /> Keyingi rejalashtirilgan quiz</div>
        {next ? (
          <div className="text-sm text-slate-200">{next.topic} <span className="text-slate-400">· {fmtDate(next.scheduledAt)}</span></div>
        ) : (
          <div className="text-xs text-slate-500">Rejalashtirilgan quiz yo'q</div>
        )}
      </Card>

      <Card className="space-y-1.5">
        <div className="text-xs font-bold text-slate-300">Oxirgi quiz natijasi</div>
        {last ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-200 truncate">{last.topic}</span>
            <Badge tone="emerald">{last.participantCount ?? 0} ishtirokchi</Badge>
          </div>
        ) : (
          <Empty text="Hali quiz o'tkazilmagan. Birinchi quizni yarating!" />
        )}
      </Card>
    </div>
  );
};
