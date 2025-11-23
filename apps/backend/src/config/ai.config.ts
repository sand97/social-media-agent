import { registerAs } from '@nestjs/config';

export interface AIConfig {
  grok: {
    apiKey: string;
    apiBase: string;
    model: string;
  };
  gemini: {
    apiKey: string;
    model: string;
  };
}

export default registerAs(
  'ai',
  (): AIConfig => ({
    grok: {
      apiKey: process.env.GROK_API_KEY || '',
      apiBase: process.env.GROK_API_BASE || 'https://api.x.ai/v1',
      model: process.env.GROK_MODEL || 'grok-4-fast-reasoning-latest',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    },
  }),
);
