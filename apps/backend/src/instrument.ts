// Import with `const Sentry = require("@sentry/nestjs");` if you are using CJS
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  enabled: process.env.MODE === 'PROD',
  dsn: 'https://e26c83f5c53b56c3e6b51671d4720d3b@o4508086168125440.ingest.de.sentry.io/4510063448490064',
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
});
