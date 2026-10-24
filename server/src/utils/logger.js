import pino from 'pino';

// Secrets and personal data never reach logs: these paths are redacted even if
// a caller accidentally passes a request or user object.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    paths: [
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'token',
      '*.token',
      'req.headers.cookie',
      'req.headers.authorization',
      'headers.cookie',
      'headers.authorization',
      'uri',
      'MONGODB_URI',
      'email',
      '*.email',
    ],
    censor: '[redacted]',
  },
});
