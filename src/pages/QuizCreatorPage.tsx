import React, { useState } from 'react';
import { Check, FileSpreadsheet, Pencil, Plus, Send, Sparkles, Trash2, CalendarClock } from 'lucide-react';
import confetti from 'canvas-confetti';
import { api } from '../lib/api';
import { confirmAction, haptic } from '../lib/tg';
import type { Difficulty, GroupRecord, QuestionRecord } from '../types';
import { Btn, Card, ErrorBox, Field, Modal, inputCls } from '../components/ui';

interface Props {
  group: GroupRecord;
  onDone: () => void;
  toast: (m: string, ok?: boolean) => void;
}

const renumber = (qs: QuestionRecord[]) => qs.map((q, i) => ({ ...q, position: i + 1 }));

export const QuizCreatorPage: React.FC<Props> = ({ group, onDone, toast }) => {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [count, setCount] = useState(5);
  const [seconds, setSeconds] = useState(30);
  const [optionsCount, setOptionsCount] = useState(4);
  const [winners, setWinners] = useState(group.certificateSettings.winnersCount);
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [when, setWhen] = useState('');
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csv, setCsv] = useState('');

  const inactive = group.status !== 'active';

  const generate = async () => {
    if (!topic.trim()) return setError('Iltimos, mavzu nomini kiriting');
    setError('');
    setGenerating(true);
    try {
      const r = await api.generate(group.id, { topic: topic.trim(), difficulty, questionCount: count, optionsCount });
      setQuestions(r.questions);
      if (r.questions.length < count) toast(`AI faqat ${r.questions.length} ta sifatli savol tuza oldi. Qo'shimcha savolni qo'lda qo'shishingiz mumkin.`, false);
    } catch (e: any) {
      setError(e.message);
      haptic('error');
    }
    setGenerating(false);
  };

  const importCsv = () => {
    const parsed: QuestionRecord[] = [];
    const bad: number[] = [];
    csv.split('\n').map(l => l.trim()).filter(Boolean).forEach((line, i) => {
      const p = line.split(';').map(x => x.trim());
      const opts = p.slice(1, 5).filter(Boolean);
      const correct = parseInt(p[5], 10) - 1;
      if (!p[0] || opts.length < 2 || !(correct >= 0 && correct < p.slice(1, 5).length) || !p[1 + correct]) return void bad.push(i + 1);
      // map chosen (1-based among the 4 columns) to the index in the filtered list
      const chosenText = p[1 + correct];
      parsed.push({ id: `q-csv-${Date.now()}-${i}`, position: 0, text: p[0].slice(0, 300), options: opts.map(o => o.slice(0, 100)), correctOptionIndex: opts.indexOf(chosenText), explanation: (p[6] || '').slice(0, 200), verified: true });
    });
    if (!parsed.length) return toast("Format noto'g'ri. Namuna: Savol;A;B;C;D;1;Izoh", false);
    setQuestions(renumber([...questions, ...parsed]).slice(0, 30));
    setCsvOpen(false);
    setCsv('');
    toast(`${parsed.length} ta savol qo'shildi${bad.length ? `, ${bad.length} ta qator xato (${bad.join(', ')})` : ''}`, bad.length === 0);
  };

  const submit = async (m: 'draft' | 'now' | 'schedule') => {
    if (!questions.length) return setError("Avval savollarni generatsiya qiling yoki qo'lda qo'shing");
    if (m === 'schedule' && !when) return setError('Boshlanish sanasi va vaqtini tanlang');
    if (m === 'now' && !(await confirmAction(`«${topic || 'Quiz'}» hozir guruhga yuborilsinmi?`))) return;
    setError('');
    setSaving(true);
    try {
      await api.createQuiz(group.id, {
        topic: topic.trim() || 'Quiz',
        difficulty,
        secondsPerQuestion: seconds,
        language: 'uz',
        winnersCount: winners,
        minScore: 1,
        questions,
        mode: m,
        // datetime-local is entered as Tashkent time (UTC+5) regardless of the phone's timezone
        scheduledAt: m === 'schedule' ? new Date(`${when}:00+05:00`).toISOString() : undefined,
      });
      haptic('success');
      if (m === 'now') confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 } });
      toast(m === 'now' ? 'Quiz guruhga yuborildi! 🚀' : m === 'schedule' ? 'Quiz rejalashtirildi ✅' : 'Qoralama saqlandi');
      onDone();
    } catch (e: any) {
      setError(e.message);
      haptic('error');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {inactive && <ErrorBox message="Guruh faol emas — quiz yuborib bo'lmaydi." />}
      {error && <ErrorBox message={error} />}

      <Card className="space-y-3">
        <Field label="Mavzu *">
          <input className={inputCls} value={topic} onChange={e => setTopic(e.target.value)} placeholder="Istalgan fan yoki mavzu: Tarix, Biologiya, Fizika..." maxLength={120} />
        </Field>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {['Matematika', 'Tarix', 'Biologiya', 'Geografiya', 'Ona tili', 'Ingliz tili', 'Informatika', 'Fizika'].map(t => (
            <button key={t} onClick={() => setTopic(t)} className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[11px] shrink-0 cursor-pointer">{t}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Qiyinlik">
            <select className={inputCls} value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}>
              <option value="easy">Oson</option>
              <option value="medium">O'rta</option>
              <option value="hard">Qiyin</option>
            </select>
          </Field>
          <Field label="Savollar soni">
            <select className={inputCls} value={count} onChange={e => setCount(Number(e.target.value))}>
              {[3, 5, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n} ta</option>)}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Har bir savol uchun vaqt (soniya)" hint="5 dan 600 soniyagacha. Vaqt tugashi bilan keyingi savol avtomatik yuboriladi.">
              <input type="number" inputMode="numeric" min={5} max={600} className={inputCls} value={seconds || ''} onChange={e => setSeconds(Number(e.target.value))} onBlur={() => setSeconds(s => Math.max(5, Math.min(600, Math.round(s) || 30)))} />
            </Field>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {[15, 20, 30, 45, 60, 90, 120].map(n => (
                <button key={n} type="button" onClick={() => setSeconds(n)} className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer ${seconds === n ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-300'}`}>{n}s</button>
              ))}
            </div>
          </div>
          <Field label="Variantlar soni">
            <select className={inputCls} value={optionsCount} onChange={e => setOptionsCount(Number(e.target.value))}>
              <option value={3}>3 ta</option>
              <option value={4}>4 ta</option>
            </select>
          </Field>

          <Field label="Sertifikat (g'oliblar)">
            <select className={inputCls} value={winners} onChange={e => setWinners(Number(e.target.value))}>
              {[1, 3, 5, 10].map(n => <option key={n} value={n}>Top-{n}</option>)}
            </select>
          </Field>

        </div>
        <Btn tone="primary" onClick={generate} busy={generating} disabled={inactive} className="w-full py-3.5">
          <Sparkles className="w-4 h-4" /> {generating ? 'AI savollarni tuzmoqda...' : questions.length ? 'Qayta generatsiya qilish' : 'AI bilan savollar yaratish'}
        </Btn>
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => setEditing({ index: null })}><Plus className="w-3.5 h-3.5" /> Qo'lda savol</Btn>
          <Btn onClick={() => setCsvOpen(true)}><FileSpreadsheet className="w-3.5 h-3.5" /> CSV import</Btn>
        </div>
        <p className="text-[11px] text-slate-500">Bugun AI: {group.plan.aiDailyUsed}/{group.plan.aiDailyQuota} generatsiya ishlatilgan.</p>
      </Card>

      {questions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-slate-100">Savollar ko'rigi ({questions.length} ta) — yuborishdan oldin tekshiring</h3>
          {questions.map((q, i) => (
            <Card key={q.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-slate-100"><span className="text-sky-400">{i + 1}.</span> {q.text}</div>
                <div className="flex shrink-0">
                  <button onClick={() => setEditing({ index: i })} className="p-1.5 text-slate-400 hover:text-sky-400 cursor-pointer"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setQuestions(renumber(questions.filter((_, j) => j !== i)))} className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="space-y-1.5">
                {q.options.map((o, oi) => (
                  <div key={oi} className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between ${oi === q.correctOptionIndex ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200' : 'bg-slate-950/60 border-slate-800 text-slate-300'}`}>
                    <span><b>{String.fromCharCode(65 + oi)}.</b> {o}</span>
                    {oi === q.correctOptionIndex && <Check className="w-4 h-4 text-emerald-400" />}
                  </div>
                ))}
              </div>
              {q.explanation && <div className="text-[11px] text-sky-300 bg-sky-950/40 border border-sky-800/40 rounded-xl p-2.5">💡 {q.explanation}</div>}
            </Card>
          ))}

          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMode('now')} className={`py-2.5 rounded-xl text-xs font-bold border cursor-pointer ${mode === 'now' ? 'bg-sky-500/20 border-sky-500 text-sky-300' : 'bg-slate-950 border-slate-700 text-slate-400'}`}>Hozir yuborish</button>
              <button onClick={() => setMode('schedule')} className={`py-2.5 rounded-xl text-xs font-bold border cursor-pointer ${mode === 'schedule' ? 'bg-sky-500/20 border-sky-500 text-sky-300' : 'bg-slate-950 border-slate-700 text-slate-400'}`}>Rejalashtirish</button>
            </div>
            {mode === 'schedule' && (
              <Field label="Boshlanish vaqti (Toshkent vaqti)" hint="Rejalashtirilgan quiz belgilangan vaqtdan keyin 5 daqiqagacha kechikib boshlanishi mumkin.">
                <input type="datetime-local" className={inputCls} value={when} onChange={e => setWhen(e.target.value)} />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Btn onClick={() => submit('draft')} busy={saving}>Qoralama</Btn>
              {mode === 'now' ? (
                <Btn tone="primary" onClick={() => submit('now')} busy={saving} disabled={inactive}><Send className="w-3.5 h-3.5" /> Yuborish 🚀</Btn>
              ) : (
                <Btn tone="primary" onClick={() => submit('schedule')} busy={saving} disabled={inactive}><CalendarClock className="w-3.5 h-3.5" /> Rejalashtirish</Btn>
              )}
            </div>
            <p className="text-[11px] text-slate-500">Savollar guruhga ketma-ket, har biri {seconds} soniya ochiq turadi; vaqt tugashi bilan keyingisi o'zi yuboriladi. Oxirida natijalar e'lon qilinadi va o'rin olganlar sertifikat tugmasini oladi.</p>
          </Card>
        </div>
      )}

      {editing && (
        <QuestionEditor
          initial={editing.index === null ? null : questions[editing.index]}
          onClose={() => setEditing(null)}
          onSave={q => {
            if (editing.index === null) setQuestions(renumber([...questions, q]).slice(0, 30));
            else setQuestions(questions.map((x, i) => (i === editing.index ? { ...q, id: x.id } : x)));
            setEditing(null);
          }}
        />
      )}

      {csvOpen && (
        <Modal title="CSV orqali import" onClose={() => setCsvOpen(false)}>
          <p className="text-xs text-slate-400">Har bir qatorda bitta savol, <code>;</code> bilan ajratilgan:<br /><code>Savol;A;B;C;D;to'g'ri_raqam(1-4);izoh</code></p>
          <textarea rows={7} className={`${inputCls} font-mono text-xs`} value={csv} onChange={e => setCsv(e.target.value)} placeholder="She ___ to school;goes;go;went;gone;1;3-shaxs birlikda -es qo'shiladi" />
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setCsvOpen(false)}>Yopish</Btn>
            <Btn tone="success" onClick={importCsv}>Import qilish</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

const QuestionEditor: React.FC<{ initial: QuestionRecord | null; onClose: () => void; onSave: (q: QuestionRecord) => void }> = ({ initial, onClose, onSave }) => {
  const [text, setText] = useState(initial?.text || '');
  const [opts, setOpts] = useState<string[]>([...(initial?.options || []), '', '', '', ''].slice(0, 4));
  const [correct, setCorrect] = useState(initial?.correctOptionIndex ?? 0);
  const [expl, setExpl] = useState(initial?.explanation || '');
  const [err, setErr] = useState('');

  const save = () => {
    const filled = opts.map((o, i) => ({ o: o.trim(), i })).filter(x => x.o);
    if (!text.trim()) return setErr('Savol matnini kiriting');
    if (filled.length < 2) return setErr('Kamida 2 ta variant kiriting');
    if (new Set(filled.map(f => f.o.toLowerCase())).size !== filled.length) return setErr('Variantlar bir xil bo\'lmasligi kerak');
    const ci = filled.findIndex(f => f.i === correct);
    if (ci === -1) return setErr("To'g'ri javob bo'sh variantga belgilangan");
    onSave({ id: `q-man-${Date.now()}`, position: 0, text: text.trim(), options: filled.map(f => f.o), correctOptionIndex: ci, explanation: expl.trim(), verified: true });
  };

  return (
    <Modal title={initial ? 'Savolni tahrirlash' : "Yangi savol (qo'lda)"} onClose={onClose}>
      {err && <ErrorBox message={err} />}
      <Field label="Savol matni (max 300)"><textarea rows={2} maxLength={300} className={inputCls} value={text} onChange={e => setText(e.target.value)} /></Field>
      <div className="space-y-2">
        <span className="block text-xs font-semibold text-slate-300">Variantlar (to'g'risini belgilang)</span>
        {opts.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} className="accent-emerald-500 w-4 h-4" />
            <input className={inputCls} maxLength={100} value={o} onChange={e => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`${String.fromCharCode(65 + i)} varianti`} />
          </div>
        ))}
      </div>
      <Field label="Izoh (max 200)"><input className={inputCls} maxLength={200} value={expl} onChange={e => setExpl(e.target.value)} placeholder="Nega aynan shu javob to'g'ri?" /></Field>
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>Bekor qilish</Btn>
        <Btn tone="primary" onClick={save}>Saqlash</Btn>
      </div>
    </Modal>
  );
};

