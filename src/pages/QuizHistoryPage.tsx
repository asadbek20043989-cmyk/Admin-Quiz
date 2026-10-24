import React, { useState } from 'react';
import { ChevronDown, RotateCcw, Send, Square, Trash2 } from 'lucide-react';
import { can } from '../lib/perms';
import { api } from '../lib/api';
import { confirmAction } from '../lib/tg';
import type { GroupView, QuizRecord, QuizSummary } from '../types';
import { Badge, Btn, Card, Empty, ErrorBox, Spinner, fmtDate } from '../components/ui';

const STATUS: Record<QuizSummary['status'], { label: string; tone: 'slate' | 'sky' | 'emerald' | 'amber' | 'rose' }> = {
  draft: { label: 'Qoralama', tone: 'slate' },
  scheduled: { label: 'Rejalashtirilgan', tone: 'sky' },
  running: { label: 'Davom etmoqda', tone: 'amber' },
  finished: { label: 'Yakunlangan', tone: 'emerald' },
  cancelled: { label: 'Bekor qilingan', tone: 'rose' },
};

interface Props {
  group: GroupView;
  quizzes: QuizSummary[];
  onChanged: () => void;
  toast: (m: string, ok?: boolean) => void;
}

export const QuizHistoryPage: React.FC<Props> = ({ group, quizzes, onChanged, toast }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuizRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const open = async (id: string) => {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    setDetail(null);
    setError('');
    setLoading(true);
    try {
      setDetail(await api.quiz(id));
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      setOpenId(null);
      onChanged();
    } catch (e: any) {
      toast(e.message, false);
    }
    setBusy(false);
  };

  if (!quizzes.length) return <Empty text="Hali quiz yaratilmagan." />;

  return (
    <div className="space-y-3">
      {quizzes.map(q => {
        const st = STATUS[q.status];
        const isOpen = openId === q.id;
        return (
          <Card key={q.id} className="!p-0 overflow-hidden">
            <button onClick={() => open(q.id)} className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-slate-100 truncate">{q.topic}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {q.questionCount} savol · {fmtDate(q.finishedAt || q.scheduledAt || q.createdAt)}
                  {q.status === 'finished' && ` · ${q.participantCount ?? 0} ishtirokchi`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge tone={st.tone}>{st.label}</Badge>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-slate-800 p-4 space-y-3 animate-fadeIn">
                {loading && <Spinner />}
                {error && <ErrorBox message={error} />}
                {detail && (
                  <>
                    {detail.status === 'finished' && (
                      detail.results && detail.results.length ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-500 text-left"><th className="py-1">#</th><th>Ism</th><th>Ball</th><th>To'g'ri</th><th>Vaqt</th><th></th></tr>
                            </thead>
                            <tbody>
                              {detail.results.map(r => (
                                <tr key={r.userId} className="border-t border-slate-800 text-slate-200">
                                  <td className="py-1.5">{r.rank}</td>
                                  <td className="max-w-[120px] truncate">{r.name}</td>
                                  <td className="font-bold">{r.score}</td>
                                  <td>{r.correctCount}/{detail.questions.length}</td>
                                  <td>{r.totalTimeSeconds}s</td>
                                  <td>{r.certificateIssued ? '🎓' : ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <Empty text="Bu quizda hech kim qatnashmagan." />
                      )
                    )}
                    {detail.status !== 'finished' && (
                      <ol className="text-xs text-slate-300 space-y-1 list-decimal list-inside">
                        {detail.questions.map(x => <li key={x.id}>{x.text}</li>)}
                      </ol>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {(detail.status === 'draft' || detail.status === 'scheduled') && (
                        <Btn tone="primary" busy={busy} onClick={async () => (await confirmAction('Hozir guruhga yuborilsinmi?')) && act(() => api.sendQuiz(detail.id), 'Quiz guruhga yuborildi 🚀')}>
                          <Send className="w-3.5 h-3.5" /> Hozir yuborish
                        </Btn>
                      )}
                      {(detail.status === 'running' || detail.status === 'scheduled') && (
                        <Btn tone="danger" busy={busy} onClick={async () => (await confirmAction(detail.status === 'running' ? "Quizni to'xtatib, natijalarni e'lon qilaymi?" : 'Rejalashtirilgan quizni bekor qilaymi?')) && act(() => api.stopQuiz(detail.id), detail.status === 'running' ? "Quiz to'xtatildi" : 'Bekor qilindi')}>
                          <Square className="w-3.5 h-3.5" /> {detail.status === 'running' ? "To'xtatish" : 'Bekor qilish'}
                        </Btn>
                      )}
                      {(detail.status === 'finished' || detail.status === 'cancelled') && group.status === 'active' && (
                        <>
                          <Btn tone="primary" busy={busy} onClick={async () => (await confirmAction(`«${detail.topic}» quizi qayta boshlansinmi? Eski natijalar tarixda saqlanadi, yangi urinish alohida hisoblanadi.`)) && act(() => api.restartQuiz(detail.id, 'now'), 'Quiz qayta boshlandi 🚀')}>
                            <RotateCcw className="w-3.5 h-3.5" /> Qayta boshlash
                          </Btn>
                          <Btn busy={busy} onClick={() => act(() => api.restartQuiz(detail.id, 'draft'), 'Nusxa qoralama sifatida saqlandi')}>Qoralama nusxa</Btn>
                        </>
                      )}
                      {detail.status !== 'running' && can(group, 'deleteQuiz') && (
                        <Btn tone="danger" busy={busy} onClick={async () => (await confirmAction("Quiz o'chirilsinmi?")) && act(() => api.deleteQuiz(detail.id), "O'chirildi")}>
                          <Trash2 className="w-3.5 h-3.5" /> O'chirish
                        </Btn>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};
