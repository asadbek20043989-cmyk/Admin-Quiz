import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Trash2, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { confirmAction, copyText } from '../lib/tg';
import { HELPER_PERMS, MAX_HELPERS, type GroupView, type HelperAdmin, type HelperInvite, type HelperPerm } from '../types';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Modal, Spinner, fmtDate, inputCls } from '../components/ui';

interface Props {
  group: GroupView;
  toast: (m: string, ok?: boolean) => void;
}

const ALL: HelperPerm[] = HELPER_PERMS.map(p => p.id);

// Vakolatlarni belgilash katakchalari (yangi taklif ham, mavjud yordamchini tahrirlash ham shu orqali).
const PermPicker: React.FC<{ value: HelperPerm[]; onChange: (v: HelperPerm[]) => void }> = ({ value, onChange }) => (
  <div className="space-y-1.5">
    {HELPER_PERMS.map(p => {
      const on = value.includes(p.id);
      return (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(on ? value.filter(x => x !== p.id) : [...value, p.id])}
          className={`w-full text-left p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer ${on ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 bg-slate-950'}`}
        >
          <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-sky-500 border-sky-500' : 'border-slate-600'}`}>{on && <Check className="w-3 h-3 text-white" />}</span>
          <span>
            <span className="block text-xs font-semibold text-slate-100">{p.label}</span>
            <span className="block text-[11px] text-slate-500">{p.hint}</span>
          </span>
        </button>
      );
    })}
  </div>
);

export const HelpersTab: React.FC<Props> = ({ group, toast }) => {
  const [data, setData] = useState<{ helpers: HelperAdmin[]; invites: HelperInvite[]; max: number } | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<HelperAdmin | null>(null);

  const load = useCallback(() => {
    setError('');
    api.helpers(group.id).then(setData).catch(e => setError(e.message));
  }, [group.id]);
  useEffect(load, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <Spinner />;

  const remove = async (h: HelperAdmin) => {
    if (!(await confirmAction(`${h.name} yordamchilar ro'yxatidan chiqarilsinmi?`))) return;
    try {
      const r = await api.helperRemove(group.id, h.userId);
      setData({ ...data, helpers: r.helpers });
      toast("Yordamchi olib tashlandi");
    } catch (e: any) {
      toast(e.message, false);
    }
  };
  const revoke = async (inv: HelperInvite) => {
    try {
      await api.helperRevokeInvite(group.id, inv.code);
      setData({ ...data, invites: data.invites.filter(i => i.code !== inv.code) });
    } catch (e: any) {
      toast(e.message, false);
    }
  };
  const full = data.helpers.length >= MAX_HELPERS;

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">Yordamchi adminlar</h3>
          <Badge tone={full ? 'amber' : 'sky'}>{data.helpers.length}/{MAX_HELPERS}</Badge>
        </div>
        <p className="text-xs text-slate-400">Yordamchilar shu panelga kirib, siz belgilagan vakolatlar doirasida ishlaydi. Yordamchilarni boshqarish va guruhni ulash faqat sizda qoladi.</p>
        <Btn tone="primary" className="w-full" disabled={full} onClick={() => setAdding(true)}><UserPlus className="w-4 h-4" /> Yordamchi qo'shish</Btn>
        {full && <p className="text-[11px] text-amber-300">Eng ko'pi bilan {MAX_HELPERS} ta yordamchi. Yangisini qo'shish uchun birortasini olib tashlang.</p>}
      </Card>

      {data.helpers.length === 0 ? (
        <Empty text="Hali yordamchi admin yo'q." />
      ) : (
        data.helpers.map(h => (
          <Card key={h.userId} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-slate-100 truncate">{h.name}</div>
                <div className="text-[11px] text-slate-500">{h.username ? `@${h.username} · ` : ''}ID: {h.userId} · {fmtDate(h.addedAt)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {h.perms.map(p => <Badge key={p} tone="indigo">{HELPER_PERMS.find(x => x.id === p)?.label || p}</Badge>)}
            </div>
            <div className="flex gap-2">
              <Btn onClick={() => setEdit(h)}>Vakolatlar</Btn>
              <Btn tone="danger" onClick={() => remove(h)}><Trash2 className="w-3.5 h-3.5" /> Olib tashlash</Btn>
            </div>
          </Card>
        ))
      )}

      {data.invites.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-bold">Kutilayotgan takliflar</h3>
          {data.invites.map(i => (
            <div key={i.code} className="flex items-center justify-between gap-2 text-xs border-b border-slate-800 pb-2 last:border-0">
              <span className="text-slate-400">{i.perms.length} ta vakolat · {fmtDate(i.expiresAt)} gacha</span>
              <Btn tone="danger" onClick={() => revoke(i)}>Bekor qilish</Btn>
            </div>
          ))}
        </Card>
      )}

      {adding && <AddModal group={group} onClose={() => setAdding(false)} onChanged={load} toast={toast} />}
      {edit && (
        <EditModal
          group={group}
          helper={edit}
          onClose={() => setEdit(null)}
          onSaved={helpers => { setData({ ...data, helpers }); setEdit(null); toast('Vakolatlar saqlandi'); }}
          toast={toast}
        />
      )}
    </div>
  );
};

const AddModal: React.FC<{ group: GroupView; onClose: () => void; onChanged: () => void; toast: Props['toast'] }> = ({ group, onClose, onChanged, toast }) => {
  const [perms, setPerms] = useState<HelperPerm[]>(['quiz', 'stats']);
  const [link, setLink] = useState('');
  const [uid, setUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const makeLink = async () => {
    if (!perms.length) return toast('Kamida bitta vakolat tanlang', false);
    setBusy(true);
    try {
      const r = await api.helperInvite(group.id, perms);
      setLink(r.link);
      onChanged();
    } catch (e: any) {
      toast(e.message, false);
    }
    setBusy(false);
  };
  const addById = async () => {
    if (!perms.length) return toast('Kamida bitta vakolat tanlang', false);
    setBusy(true);
    try {
      await api.helperAdd(group.id, uid.trim(), perms);
      toast("Yordamchi qo'shildi");
      onChanged();
      onClose();
    } catch (e: any) {
      toast(e.message, false);
    }
    setBusy(false);
  };

  return (
    <Modal title="Yordamchi qo'shish" onClose={onClose}>
      {link ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Havolani yordamchiga yuboring. U botni ochib «Start» bosadi (u guruh a'zosi bo'lishi kerak). Havola bir martalik, 48 soat amal qiladi.</p>
          <div className="text-xs font-mono break-all text-white bg-slate-950 border border-slate-700 rounded-xl p-3">{link}</div>
          <Btn tone="primary" className="w-full" onClick={async () => { await copyText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
            {copied ? <><Check className="w-4 h-4" /> Nusxalandi</> : <><Copy className="w-4 h-4" /> Havolani nusxalash</>}
          </Btn>
          <Btn className="w-full" onClick={onClose}>Yopish</Btn>
        </div>
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-300">Vakolatlar</span>
              <button className="text-[11px] text-sky-400 cursor-pointer" onClick={() => setPerms(perms.length === ALL.length ? [] : ALL)}>{perms.length === ALL.length ? 'Hammasini olib tashlash' : 'Hammasini tanlash'}</button>
            </div>
            <PermPicker value={perms} onChange={setPerms} />
          </div>
          <Btn tone="primary" busy={busy} className="w-full" onClick={makeLink}><Link2 className="w-4 h-4" /> Taklif havolasini yaratish</Btn>
          <div className="border-t border-slate-800 pt-3 space-y-2">
            <Field label="Yoki Telegram ID bo'yicha" hint="Yordamchi guruh a'zosi bo'lishi shart. ID ni @userinfobot orqali bilish mumkin.">
              <input className={inputCls} inputMode="numeric" value={uid} onChange={e => setUid(e.target.value.replace(/\D/g, ''))} placeholder="123456789" />
            </Field>
            <Btn busy={busy} className="w-full" disabled={uid.length < 5} onClick={addById}>ID bo'yicha qo'shish</Btn>
          </div>
        </>
      )}
    </Modal>
  );
};

const EditModal: React.FC<{ group: GroupView; helper: HelperAdmin; onClose: () => void; onSaved: (h: HelperAdmin[]) => void; toast: Props['toast'] }> = ({ group, helper, onClose, onSaved, toast }) => {
  const [perms, setPerms] = useState<HelperPerm[]>(helper.perms);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      onSaved((await api.helperPerms(group.id, helper.userId, perms)).helpers);
    } catch (e: any) {
      toast(e.message, false);
    }
    setBusy(false);
  };
  return (
    <Modal title={`Vakolatlar: ${helper.name}`} onClose={onClose}>
      <PermPicker value={perms} onChange={setPerms} />
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>Bekor</Btn>
        <Btn tone="primary" busy={busy} disabled={!perms.length} onClick={save}>Saqlash</Btn>
      </div>
    </Modal>
  );
};
