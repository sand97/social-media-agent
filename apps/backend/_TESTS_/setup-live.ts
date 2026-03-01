import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env') });

if (process.env.AGENT_LIVE_TESTS === 'true') {
  process.env.LANGSMITH_TRACING = process.env.LANGSMITH_TRACING || 'true';
}
