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
          generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.7 } : { temperature: 0.5 },
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
  beginner: 'A1 (beginner)',
  elementary: 'A2 (elementary)',
  intermediate: 'B1 (intermediate)',
  upper_intermediate: 'B2 (upper-intermediate)',
  advanced: 'C1 (advanced)',
};

async function generateChunk(p: {
  topic: string;
  difficulty: Difficulty;
  count: number;
  optionsCount: number;
  language: 'uz' | 'en';
}): Promise<{ qs: any[]; tokens: number }> {
  const prompt = `You are an experienced English teacher writing multiple-choice quiz questions for Uzbek learners of English.
Topic: "${p.topic.replace(/"/g, "'")}"
CEFR level: ${LEVEL[p.difficulty]}
Number of questions: ${p.count}
Options per question: ${p.optionsCount}
Explanation language: ${p.language === 'uz' ? "Uzbek (Latin script)" : 'English'}

Rules:
- Questions are in English. Exactly ONE option is correct; the others are plausible but clearly wrong.
- Solve every question yourself before answering; the marked answer must be 100% correct.
- No duplicate questions. Avoid ambiguity.
- Limits: question <= 280 chars, each option <= 90 chars, explanation <= 190 chars.
Return ONLY a JSON array, no markdown:
[{"text":"...","options":["..."],"correctOptionIndex":0,"correctOptionText":"exact text of the correct option","explanation":"short why"}]`;
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
  language: 'uz' | 'en';
}): Promise<{ questions: QuestionRecord[]; tokens: number }> {
  const total = Math.max(1, Math.min(30, p.questionCount));
  const chunkSize = 5;
  const chunks: number[] = [];
  for (let left = total + 1; left > 0; left -= chunkSize) chunks.push(Math.min(chunkSize, left)); // +1 spare
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
  if (collected.length < total) err = (await run([Math.min(10, total - collected.length + 2)])) || err;
  if (collected.length === 0) throw err instanceof Error ? err : new Error("AI savollar yarata olmadi, qayta urinib ko'ring");

  collected = collected.slice(0, total);
  const stamp = Date.now();
  return {
    tokens,
    questions: collected.map((q, i) => ({ ...q, id: `q-${stamp}-${i + 1}`, position: i + 1 })),
  };
}

export async function explainGrammar(sentence: string): Promise<string> {
  const r = await gemini(
    `Quyidagi ingliz tili jumlasining grammatik tuzilishini, qoidasini va zamonini o'zbek tilida (lotin yozuvida) qisqa va tushunarli tushuntiring (ko'pi bilan 4 gap, oddiy matn, markdown belgilarsiz): "${sentence.slice(0, 400).replace(/"/g, "'")}"`,
    false
  );
  return r.text.trim();
}
