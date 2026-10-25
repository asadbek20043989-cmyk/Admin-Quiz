import { WEBHOOK_SECRET } from '../lib/config.ts';
import { runGenJob } from '../lib/gen.ts';

// Background function: generates and verifies quiz questions (can take longer than a normal 10s function).
export default async (req: Request) => {
  if (req.headers.get('x-runner-secret') !== WEBHOOK_SECRET()) return new Response('forbidden', { status: 403 });
  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) return new Response('bad request', { status: 400 });
  await runGenJob(jobId);
  return new Response('ok');
};
