import { WEBHOOK_SECRET } from '../lib/config.ts';
import { getQuiz } from '../lib/db.ts';
import { advance, launchRunner } from '../lib/quizEngine.ts';

// Netlify Background Function (name ends with -background, so it may run up to 15 minutes).
// It only sleeps and wakes when a question's time is over, so each next question is sent
// exactly on time. Nothing runs while no quiz is active.
const BUDGET_MS = 13 * 60 * 1000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default async (req: Request) => {
  if (req.headers.get('x-runner-secret') !== WEBHOOK_SECRET()) return new Response('forbidden', { status: 403 });
  const { quizId, token } = (await req.json().catch(() => ({}))) as { quizId?: string; token?: string };
  if (!quizId || !token) return new Response('bad request', { status: 400 });

  const started = Date.now();
  for (let i = 0; i < 300; i++) {
    const quiz = await getQuiz(quizId);
    // Stop when the quiz ended or a newer runner took over.
    if (!quiz || quiz.status !== 'running' || quiz.runner !== token || quiz.cursor === undefined) return new Response('done');

    const wait = (quiz.nextAt || 0) + 1200 - Date.now();
    if (wait > 0) {
      if (Date.now() - started + wait > BUDGET_MS) {
        await launchRunner(quizId); // hand over to a fresh runner with a full time budget
        return new Response('handover');
      }
      await sleep(wait);
      continue;
    }
    await advance(quizId, quiz.cursor); // sends the next question or publishes the results
  }
  return new Response('loop-limit');
};
