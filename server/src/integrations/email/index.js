import nodemailer from 'nodemailer';

import { logger } from '../../utils/logger.js';

/**
 * Outcome of an attempt. `sent` means the provider accepted the message; it
 * does not prove delivery to the inbox.
 */

class SmtpSender {
  mode = 'smtp';
  transport;
  from;
  constructor(env, from) {
    this.from = from;
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
    });
  }
  async send(msg) {
    try {
      await this.transport.sendMail({ from: this.from, ...msg });
      return { status: 'sent', provider: 'smtp' };
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message.slice(0, 200) : 'Unknown error' };
    }
  }
}

/**
 * Development mode: keeps the last messages in server memory only. Nothing is
 * sent and nothing is written to the database (so no one-time code is ever
 * persisted in plain text). Refused in production by env validation.
 */
export class DevOutboxSender {
  mode = 'dev';
  outbox = [];
  seq = 0;
  async send(msg) {
    this.outbox.unshift({ ...msg, id: String(++this.seq), createdAt: new Date() });
    this.outbox.length = Math.min(this.outbox.length, 20);
    logger.info({ subject: msg.subject }, 'DEV EMAIL MODE: message kept in the in-memory dev outbox, NOT sent');
    return { status: 'dev-outbox' };
  }
}

class DisabledSender {
  mode = 'none';
  async send() {
    return { status: 'disabled' };
  }
}

export function createEmailSender(env) {
  switch (env.EMAIL_PROVIDER) {
    case 'smtp':
      return new SmtpSender(env, env.EMAIL_FROM);
    case 'dev':
      return new DevOutboxSender();
    default:
      return new DisabledSender();
  }
}
