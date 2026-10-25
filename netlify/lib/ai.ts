import type { Difficulty, QuestionRecord } from '../../src/types/index.ts';
import { GEMINI_KEY, GEMINI_MODEL } from './config.ts';

interface GeminiResult {
  text: string;
  tokens: number;
}

// Google retires models over time (a retired model answers HTTP 404). We try the configured model
// first and then fall back to others, remembering whichever works while the instance is warm.
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'];
let workingModel = '';
let thinkingUnsupported = false;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function callModel(model: string, prompt: string, json: boolean, timeoutMs: number, withThinking: boolean, maxTokens: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY() },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          ...(json ? { responseMimeType: 'application/json', temperature: 0.3 } : { temperature: 0.4 }),
          maxOutputTokens: maxTokens,
          ...(withThinking ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        },
      }),
      signal: ctrl.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// `patient` is for background jobs: if every model answers 429 (quota), wait and try again
// (per-minute quotas recover quickly). Interactive calls fail fast instead.
async function gemini(prompt: string, json: boolean, opts: { timeoutMs?: number; patient?: boolean; maxTokens?: number } = {}): Promise<GeminiResult> {
  if (!GEMINI_KEY()) throw new Error('GEMINI_API_KEY sozlanmagan');
  const timeoutMs = opts.timeoutMs ?? (opts.patient ? 60000 : 8500);
  const maxTokens = opts.maxTokens ?? 4000;
  const rounds = opts.patient ? 4 : 1;
  let lastMsg = '';
  let quotaHit = false;
  try {
    for (let round = 0; round < rounds; round++) {
      if (round > 0) await sleep(15000);
      quotaHit = false;
      const candidates = [...new Set([workingModel, GEMINI_MODEL(), ...FALLBACK_MODELS].filter(Boolean))];
      for (const model of candidates) {
        let r = await callModel(model, prompt, json, timeoutMs, !thinkingUnsupported, maxTokens);
        if (r.status === 400 && !thinkingUnsupported) {
          thinkingUnsupported = true;
          r = await callModel(model, prompt, json, timeoutMs, false, maxTokens);
        }
        if (r.status === 404) {
          lastMsg = `«${model}» modeli topilmadi`;
          continue;
        }
        if (r.status === 429 || r.status === 503) {
          quotaHit = true; // quota used up or overloaded: another model may still answer
          continue;
        }
        if (r.status !== 200) {
          const detail = String(r.data?.error?.message || '').slice(0, 140);
          throw new Error(`AI xatosi (${r.status})${detail ? ': ' + detail : ''}`);
        }
        workingModel = model;
        const text = r.data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
        return { text, tokens: r.data?.usageMetadata?.totalTokenCount || 0 };
      }
      if (!quotaHit) break;
    }
    if (quotaHit) throw new Error("Gemini kvotasi tugagan (429). Birozdan keyin urinib ko'ring yoki Google AI Studio'da to'lov (billing) ulang / boshqa kalit qo'ying.");
    throw new Error(`AI modeli topilmadi (${lastMsg}). Netlify'da GEMINI_MODEL ni hozirgi modelga o'zgartiring (masalan gemini-3.8-flash).`);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error("AI javob berishga ulgurmadi, qayta urinib ko'ring");
    throw e;
  }
}

const LEVEL: Record<Difficulty, string> = {
  easy: "oson (asosiy, maktab boshlang'ich darajasi)",
  medium: "o'rta (umumiy maktab darajasi)",
  hard: "qiyin (chuqur bilim va fikrlashni talab qiladi)",
};

const RULES = `Qat'iy qoidalar:
- Faqat aniq, umume'tirof etilgan, ishonchli manbalarda (darslik, ensiklopediya, fan qoidalari) tasdiqlangan faktlarga asoslangan savollar tuz. Gumon qilsang, o'sha savolni TASHLAB KET.
- Bahsli, shaxsiy fikrga bog'liq, vaqt o'tishi bilan o'zgaradigan (hozirgi lavozim, narx, reyting) savollar tuzma.
- Insonga zarar yetkazishi yoki uni noto'g'ri yo'lga boshlashi mumkin bo'lgan mavzular (tibbiy/huquqiy/moliyaviy maslahat, dori dozalari, xavfli harakatlar, zo'ravonlik, jinsiy, nafrat, ekstremizm, siyosiy targ'ibot, aldov) taqiqlanadi.
- Savollar, variantlar FAQAT o'zbek tilida (lotin yozuvida). Faqat mavzu chet tili bo'lsa, o'rganilayotgan til misollari o'sha tilda bo'lishi mumkin.
- Aynan BITTA variant to'g'ri bo'lsin, qolganlari ishonarli, lekin aniq xato bo'lsin. Savol noaniq bo'lmasin, takrorlanmasin.
- Izoh, manba yoki asos YOZMA.
- Uzunlik: savol <= 250, variant <= 80 belgi.`;

async function generateChunk(p: { subject: string; difficulty: Difficulty; count: number; optionsCount: number; avoid?: string[] }) {
  const prompt = `Siz tajribali o'qituvchisiz. Quyidagi fan/mavzu bo'yicha test savollari tuzing.
Fan/mavzu: "${p.subject.replace(/["\n]/g, ' ')}"
Qiyinlik: ${LEVEL[p.difficulty]}
Savollar soni: ${p.count}
Har bir savolda variantlar soni: ${p.optionsCount}
${p.avoid?.length ? `Quyidagi savollarga o'xshash savol tuzma: ${p.avoid.slice(0, 30).join(' | ')}\n` : ''}
${RULES}
Faqat JSON massiv qaytaring (markdown yo'q):
[{"text":"...","options":["..."],"correctOptionIndex":0,"correctOptionText":"to'g'ri variantning aynan o'zi"}]`;
  const r = await gemini(prompt, true, { patient: true });
  try {
    const parsed = JSON.parse(r.text.replace(/```json|```/g, '').trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type Draft = { text: string; options: string[]; correctOptionIndex: number };

function clean(q: any): Draft | null {
  if (!q || typeof q.text !== 'string' || !Array.isArray(q.options)) return null;
  const options = q.options.map((o: any) => String(o ?? '').trim().slice(0, 100)).filter(Boolean).slice(0, 4);
  if (options.length < 3 || new Set(options.map((o: string) => o.toLowerCase())).size !== options.length) return null;
  let idx = Number(q.correctOptionIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) return null;
  if (typeof q.correctOptionText === 'string' && q.correctOptionText.trim()) {
    const want = q.correctOptionText.trim().toLowerCase();
    if (options[idx].toLowerCase() !== want) {
      const found = options.findIndex((o: string) => o.toLowerCase() === want);
      if (found === -1) return null;
      idx = found;
    }
  }
  return { text: q.text.trim().slice(0, 300), options, correctOptionIndex: idx };
}

// Second, independent pass: the model solves each question WITHOUT seeing the marked answer.
// A question is kept only if the answers agree, the model is sure, and the question is safe.
async function verify(drafts: Draft[]): Promise<Draft[]> {
  const kept: Draft[] = [];
  const size = 12;
  const parts: Draft[][] = [];
  for (let i = 0; i < drafts.length; i += size) parts.push(drafts.slice(i, i + size));
  const results = await Promise.all(
    parts.map(async part => {
      const payload = part.map((q, i) => ({ i, text: q.text, options: q.options }));
      const prompt = `Siz qat'iy faktlarni tekshiruvchi mutaxassissiz. Quyida test savollari berilgan (to'g'ri javob ko'rsatilmagan).
Har bir savol uchun mustaqil o'ylab, quyidagilarni aniqlang:
- "answer": to'g'ri variant raqami (0 dan boshlab),
- "sure": faqat javobingizga 100% ishonchingiz komil va u aniq, umume'tirof etilgan faktga asoslangan bo'lsa true, aks holda false,
- "single": aynan bitta variant to'g'ri bo'lsa true,
- "safe": savol zararsiz bo'lsa true (tibbiy/huquqiy/moliyaviy maslahat, xavfli harakat, zo'ravonlik, jinsiy, nafrat, siyosiy targ'ibot yoki odamni noto'g'ri yo'lga boshlovchi bo'lsa false).
Faqat JSON massiv qaytaring: [{"i":0,"answer":1,"sure":true,"single":true,"safe":true}]
Savollar:
${JSON.stringify(payload)}`;
      const r = await gemini(prompt, true, { patient: true, maxTokens: 2000 });
      let arr: any[] = [];
      try {
        arr = JSON.parse(r.text.replace(/```json|```/g, '').trim());
      } catch {
        throw new Error("Savollarni tekshirib bo'lmadi, qayta urinib ko'ring");
      }
      if (!Array.isArray(arr)) throw new Error("Savollarni tekshirib bo'lmadi, qayta urinib ko'ring");
      return part.filter((q, i) => {
        const v = arr.find(x => x && Number(x.i) === i);
        return !!v && Number(v.answer) === q.correctOptionIndex && v.sure === true && v.single === true && v.safe === true;
      });
    })
  );
  for (const r of results) kept.push(...r);
  return kept;
}

export interface GenParams {
  subject: string;
  difficulty: Difficulty;
  count: number;
  optionsCount: number;
  avoid?: string[];
}

// Generates candidates, verifies them independently and returns only verified questions.
export async function generateVerified(p: GenParams): Promise<{ questions: QuestionRecord[]; requested: number }> {
  const total = Math.max(1, Math.min(30, p.count));
  const accepted: Draft[] = [];
  const seen = new Set<string>();
  const key = (t: string) => t.toLowerCase().replace(/\W+/g, ' ').trim();
  let lastErr: any = null;

  for (let round = 0; round < 3 && accepted.length < total; round++) {
    const need = total - accepted.length;
    const want = Math.min(40, Math.ceil(need * (round === 0 ? 1.4 : 2)) + 1);
    const sizes: number[] = [];
    for (let left = want; left > 0; left -= 10) sizes.push(Math.min(10, left));
    const settled = await Promise.allSettled(sizes.map(count => generateChunk({ ...p, count, avoid: [...(p.avoid || []), ...accepted.map(a => a.text)] })));
    const drafts: Draft[] = [];
    for (const s of settled) {
      if (s.status === 'rejected') {
        lastErr = s.reason;
        continue;
      }
      for (const raw of s.value) {
        const q = clean(raw);
        if (!q || seen.has(key(q.text))) continue;
        seen.add(key(q.text));
        drafts.push(q);
      }
    }
    if (!drafts.length) continue;
    accepted.push(...(await verify(drafts))); // a failed verification aborts: nothing unverified is ever used
  }

  if (!accepted.length) throw lastErr instanceof Error ? lastErr : new Error("Ishonchli savollar tuzib bo'lmadi. Mavzuni aniqroq yozib qayta urinib ko'ring.");
  const stamp = Date.now();
  return {
    requested: total,
    questions: accepted.slice(0, total).map((q, i) => ({ ...q, id: `q-${stamp}-${i + 1}`, position: i + 1, explanation: '', verified: true })),
  };
}

// For automatic quizzes: choose a subject from the group's name and one specific topic in it.
export async function pickTopic(groupTitle: string, avoid: string[]): Promise<string> {
  const title = groupTitle.replace(/["\n]/g, ' ').slice(0, 80);
  const r = await gemini(
    `Telegram guruhi nomi: "${title}".
Shu nomga mos o'quv fani yoki yo'nalishini aniqla (masalan "Ingliz tili", "Matematika", "Tarix"). Agar nom aniq fan bildirmasa, "Umumiy bilimlar" ni ol.
So'ng shu fan doirasidan bugungi test uchun BITTA aniq, maktab/ta'lim darajasidagi mavzuni tanla.${avoid.length ? ` Oldingi mavzular (takrorlama): ${avoid.slice(-8).join('; ')}.` : ''}
Faqat JSON qaytaring: {"subject":"...","topic":"..."}`,
    true,
    { patient: true, maxTokens: 300 }
  );
  try {
    const o = JSON.parse(r.text.replace(/```json|```/g, '').trim());
    const subject = String(o.subject || '').trim().slice(0, 40);
    const topic = String(o.topic || '').trim().slice(0, 60);
    if (subject) return topic ? `${subject}: ${topic}` : subject;
  } catch {
    /* fall through */
  }
  return 'Umumiy bilimlar';
}

export async function explainText(text: string): Promise<string> {
  const r = await gemini(
    `Quyidagi savol yoki matnni o'zbek tilida (lotin yozuvida) qisqa va tushunarli tushuntiring (ko'pi bilan 4 gap, oddiy matn, markdown belgilarsiz). Faqat aniq, ishonchli ma'lumot bering; ishonchingiz komil bo'lmasa, buni ayting: "${text.slice(0, 500).replace(/"/g, "'")}"`,
    false
  );
  return r.text.trim();
}
