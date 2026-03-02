import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import {
  ReadableStream,
  TransformStream,
  WritableStream,
} from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';

loadEnv({ path: resolve(process.cwd(), '.env') });

if (process.env.AGENT_LIVE_TESTS === 'true') {
  process.env.LANGSMITH_TRACING = process.env.LANGSMITH_TRACING || 'true';
}

const globalAny = globalThis as any;

if (!globalAny.ReadableStream) {
  globalAny.ReadableStream = ReadableStream;
}

if (!globalAny.TransformStream) {
  globalAny.TransformStream = TransformStream;
}

if (!globalAny.WritableStream) {
  globalAny.WritableStream = WritableStream;
}

if (!globalAny.TextEncoder) {
  globalAny.TextEncoder = TextEncoder;
}

if (!globalAny.TextDecoder) {
  globalAny.TextDecoder = TextDecoder;
}
