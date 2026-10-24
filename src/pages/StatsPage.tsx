import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { GroupRecord, StatsOverview } from '../types';
import { Card, Empty, ErrorBox, Spinner } from '../components/ui';

const Bar: React.FC<{ label: string; value: number; max: number; suffix?: string; color?: string }> = ({ label, value, max, suffix = '', color = 'bg-sky-500' }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs text-slate-300"><span className="truncate pr-2">{label}</span><b>{value}{suffix}</b></div>
    <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${max ? Math.max(4, (value / max) * 100) : 0}%` }} /></div>
  </div>
);

export const StatsPage: React.FC<{ group: GroupRecord }> = ({ group }) => {
  const [s, setS] = useState<StatsOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setS(null);
    setError('');
    api.stats(group.id).then(setS).catch(e => setError(e.message));
  }, [group.id]);

  if (error) return <ErrorBox message={error} />;
  if (!s) return <Spinner />;

  const cards = [
    { label: "A'zolar", value: s.totalMembers.toLocaleString() },
    { label: 'Quizlar', value: s.totalQuizzesConducted },
    { label: "Ishtirok (7 kun)", value: s.activeParticipantsLastWeek },
    { label: "O'rtacha natija", value: `${s.averageScorePercent}%` },
    { label: 'Sertifikatlar', value: s.certificatesIssued },
  ];
  const empty = s.totalQuizzesConducted === 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        {cards.map(c => (
          <Card key={c.label} className="!p-3.5"><div className="text-xl font-extrabold text-white">{c.value}</div><div className="text-[11px] text-slate-400">{c.label}</div></Card>
        ))}
      </div>
      {empty && <Empty text="Statistika quizlar o'tkazilgach to'planadi. Hozircha hammasi noldan." />}
      {s.hardestTopics.length > 0 && (
        <Card className="space-y-3"><h3 className="text-sm font-bold">Eng qiyin mavzular (xato %)</h3>
          {s.hardestTopics.map(t => <Bar key={t.topic} label={t.topic} value={t.errorRate} max={100} suffix="%" color="bg-rose-500" />)}
        </Card>
      )}
      {s.bestPostingHours.length > 0 && (
        <Card className="space-y-3"><h3 className="text-sm font-bold">Eng faol soatlar (ishtirokchilar)</h3>
          {s.bestPostingHours.map(h => <Bar key={h.hour} label={h.hour} value={h.participation} max={s.bestPostingHours[0].participation} color="bg-emerald-500" />)}
        </Card>
      )}
      {s.growthHistory.length > 0 && (
        <Card className="space-y-3"><h3 className="text-sm font-bold">So'nggi kunlar</h3>
          {s.growthHistory.map(d => (
            <div key={d.date} className="flex justify-between text-xs text-slate-300 border-b border-slate-800 pb-1.5 last:border-0">
              <span>{d.date}</span><span>{d.members.toLocaleString()} a'zo · {d.participants} ishtirok</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};
