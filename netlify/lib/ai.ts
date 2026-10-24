import type { Difficulty, QuestionRecord } from '../../src/types/index.ts';
import { GEMINI_KEY, GEMINI_MODEL } from './config.ts';

interface GeminiResult {
  text: string;
  tokens: number;
}

async function gemini(prompt: string, json: boolean, timeoutMs = 8500): Promise<GeminiResult> {
  const key = GEMINI_KEY();
  if (!key) throw new Error("GEMINI_API_KEY sozlanmagan");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            ...(json ? { responseMimeType: 'application/json', temperature: 0.6 } : { temperature: 0.4 }),
            maxOutputTokens: 3000,
            // "Thinking" makes Gemini 2.5 several times slower; quiz questions do not need it.
            ...(/2\.5-flash/.test(GEMINI_MODEL()) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
        signal: ctrl.signal,
      }
    );
    if (!res.ok) throw new Error(`AI xatosi (${res.status})`);
    const data: any = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    return { text, tokens: data?.usageMetadata?.totalTokenCount || 0 };
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error("AI javob berishga ulgurmadi, qayta urinib ko'ring");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const LEVEL: Record<Difficulty, string> = {
  easy: "oson (asosiy, maktab boshlang'ich darajasi)",
  medium: "o'rta (umumiy maktab darajasi)",
  hard: "qiyin (chuqur bilim va fikrlashni talab qiladi)",
};

async function generateChunk(p: {
  topic: string;
  difficulty: Difficulty;
  count: number;
  optionsCount: number;
}): Promise<{ qs: any[]; tokens: number }> {
  const prompt = `Siz tajribali o'qituvchisiz. Quyidagi fan/mavzu bo'yicha test savollari tuzing.
Fan/mavzu: "${p.topic.replace(/"/g, "'")}"
Qiyinlik: ${LEVEL[p.difficulty]}
Savollar soni: ${p.count}
Har bir savolda variantlar soni: ${p.optionsCount}

Qoidalar:
- Savollar, variantlar va izohlar FAQAT o'zbek tilida (lotin yozuvida) bo'lsin. Faqat mavzu chet tili bo'lsa, o'rganilayotgan til misollari o'sha tilda yozilishi mumkin.
- Aynan BITTA variant to'g'ri bo'lsin, qolganlari ishonarli, lekin aniq xato bo'lsin.
- Har bir savolni o'zingiz yechib tekshiring: belgilangan javob 100% to'g'ri bo'lishi shart.
- Savollar takrorlanmasin, noaniq bo'lmasin.
- Uzunlik: savol <= 250, variant <= 80, izoh <= 180 belgi.
Faqat JSON massiv qaytaring (markdown yo'q):
[{"text":"...","options":["..."],"correctOptionIndex":0,"correctOptionText":"to'g'ri variantning aynan o'zi","explanation":"qisqa izoh"}]`;
  const r = await gemini(prompt, true);
  let parsed: any;
  try {
    parsed = JSON.parse(r.text.replace(/```json|```/g, '').trim());
  } catch {
    parsed = [];
  }
  return { qs: Array.isArray(parsed) ? parsed : [], tokens: r.tokens };
}

function clean(q: any, optionsCount: number): Omit<QuestionRecord, 'id' | 'position'> | null {
  if (!q || typeof q.text !== 'string' || !Array.isArray(q.options)) return null;
  const options = q.options.map((o: any) => String(o ?? '').trim().slice(0, 100)).filter(Boolean).slice(0, 4);
  if (options.length < 3 || new Set(options.map((o: string) => o.toLowerCase())).size !== options.length) return null;
  let idx = Number(q.correctOptionIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) return null;
  // Cross-check: the declared correct text must match the option at the declared index.
  if (typeof q.correctOptionText === 'string' && q.correctOptionText.trim()) {
    const want = q.correctOptionText.trim().toLowerCase();
    if (options[idx].toLowerCase() !== want) {
      const found = options.findIndex((o: string) => o.toLowerCase() === want);
      if (found === -1) return null;
      idx = found;
    }
  }
  void optionsCount;
  return {
    text: q.text.trim().slice(0, 300),
    options,
    correctOptionIndex: idx,
    explanation: String(q.explanation || '').trim().slice(0, 200),
    verified: true,
  };
}

export async function generateQuiz(p: {
  topic: string;
  difficulty: Difficulty;
  questionCount: number;
  optionsCount: number;
}): Promise<{ questions: QuestionRecord[]; tokens: number }> {
  const total = Math.max(1, Math.min(30, p.questionCount));
  const chunkSize = 5;
  const chunks: number[] = [];
  for (let left = total; left > 0; left -= chunkSize) chunks.push(Math.min(chunkSize, left));
  let tokens = 0;
  let collected: Omit<QuestionRecord, 'id' | 'position'>[] = [];
  const seen = new Set<string>();

  const run = async (sizes: number[]) => {
    const results = await Promise.allSettled(sizes.map(count => generateChunk({ ...p, count })));
    let lastErr: any = null;
    for (const r of results) {
      if (r.status === 'rejected') {
        lastErr = r.reason;
        continue;
      }
      tokens += r.value.tokens;
      for (const raw of r.value.qs) {
        const q = clean(raw, p.optionsCount);
        if (!q) continue;
        const k = q.text.toLowerCase().replace(/\W+/g, ' ').trim();
        if (seen.has(k)) continue;
        seen.add(k);
        collected.push(q);
      }
    }
    return lastErr;
  };

  let err = await run(chunks);
  if (collected.length < total) err = (await run([Math.min(8, total - collected.length + 1)])) || err;
  if (collected.length === 0) throw err instanceof Error ? err : new Error("AI savollar yarata olmadi, qayta urinib ko'ring");

  collected = collected.slice(0, total);
  const stamp = Date.now();
  return {
    tokens,
    questions: collected.map((q, i) => ({ ...q, id: `q-${stamp}-${i + 1}`, position: i + 1 })),
  };
}

export async function explainText(text: string): Promise<string> {
  const r = await gemini(
    `Quyidagi savol yoki matnni o'zbek tilida (lotin yozuvida) qisqa va tushunarli tushuntiring (ko'pi bilan 4 gap, oddiy matn, markdown belgilarsiz): "${text.slice(0, 500).replace(/"/g, "'")}"`,
    false
  );
  return r.text.trim();
}
