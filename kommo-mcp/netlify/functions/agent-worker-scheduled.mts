import { processAgentJob } from './agent-worker.mts';

export const config = { schedule: '* * * * *' };

export default async () => processAgentJob();
