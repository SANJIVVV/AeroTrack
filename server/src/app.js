import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { existsSync } from 'node:fs';

import { corsOrigins } from './config/env.js';
import { loadSession } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { createLimiters, requireCsrfHeader } from './middleware/security.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { baggageRoutes } from './routes/baggage.js';
import { scanRoutes } from './routes/scans.js';
import { checkpointRoutes } from './routes/checkpoints.js';
import { flightRoutes } from './routes/flights.js';
import { airlineRoutes } from './routes/airlines.js';
import { incidentRoutes } from './routes/incidents.js';
import { alertRoutes } from './routes/alerts.js';
import { notificationRoutes } from './routes/notifications.js';
import { adminRoutes } from './routes/admin.js';
import { demoRoutes } from './routes/demo.js';
import { healthRoutes } from './routes/health.js';

export function createApp(ctx, opts = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (ctx.env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'"],
          workerSrc: ["'self'", 'blob:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  const allowed = corsOrigins(ctx.env);
  app.use(
    '/api',
    cors({
      origin: (origin, cb) => cb(null, !origin || allowed.includes(origin)),
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-Requested-With', 'If-Match'],
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  const limiters = createLimiters(!!opts.disableRateLimit);
  app.use('/api/health', healthRoutes(ctx));
  app.use('/api', limiters.api, requireCsrfHeader, loadSession);
  app.use('/api/auth', authRoutes(ctx, limiters));
  app.use('/api/users', userRoutes(ctx));
  app.use('/api/baggage', baggageRoutes(ctx));
  app.use('/api/scans', scanRoutes(ctx, limiters));
  app.use('/api/checkpoints', checkpointRoutes(ctx));
  app.use('/api/flights', flightRoutes(ctx));
  app.use('/api/airlines', airlineRoutes(ctx));
  app.use('/api/incidents', incidentRoutes(ctx));
  app.use('/api/alerts', alertRoutes(ctx));
  app.use('/api/notifications', notificationRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api/demo', demoRoutes(ctx));
  app.use('/api', notFoundHandler);

  // Single-service deployment: serve the built client from the API server.
  // The browser app is plain HTML, CSS and JavaScript, so it is served as-is
  // (no build step). Scripts and styles are revalidated on every load so an
  // update is never mixed with an older cached file.
  if (opts.clientDir && existsSync(opts.clientDir)) {
    const setHeaders = (res, file) => {
      if (/\.(js|css|html|webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    };
    // Shared rules (status flow, QR format, airline directory) are the same ES modules the server uses.
    if (opts.sharedDir && existsSync(opts.sharedDir)) {
      app.use('/shared', (req, res, next) => (/\.test\.js$/.test(req.path) ? res.status(404).end() : next()), express.static(opts.sharedDir, { index: false, setHeaders }));
    }
    app.use(express.static(opts.clientDir, { index: false, maxAge: '1d', setHeaders }));
    // Any other path without a file extension is a page of the single-page app.
    app.get(/^(?!\/api\/|\/shared\/)[^.]*$/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(opts.clientDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
