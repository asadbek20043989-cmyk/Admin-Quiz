import { runDue } from '../lib/quizEngine.ts';

// Runs every 5 minutes. It reads one tiny index blob and exits immediately when nothing is due,
// so it costs almost nothing. It starts scheduled quizzes and recovers stalled ones.
export default async () => {
  try {
    await runDue();
  } catch (e) {
    console.error('cron error', e);
  }
};

export const config = { schedule: '*/5 * * * *' };
