import { WEBHOOK_SECRET } from '../lib/config.ts';
import { runAutoQuiz } from '../lib/autoQuiz.ts';

// Background function: builds and sends one automatic quiz for a group.
export default async (req: Request) => {
  if (req.headers.get('x-runner-secret') !== WEBHOOK_SECRET()) return new Response('forbidden', { status: 403 });
  const { gid } = (await req.json().catch(() => ({}))) as { gid?: string };
  if (!gid) return new Response('bad request', { status: 400 });
  await runAutoQuiz(gid);
  return new Response('ok');
};
