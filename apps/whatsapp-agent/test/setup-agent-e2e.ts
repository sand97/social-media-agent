import 'reflect-metadata';
import './setup-e2e';
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';

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
