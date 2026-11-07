/**
 * Express Application Setup
 *
 * Configures middleware stack, mounts API routes, and sets up
 * error handling. This module exports the Express app without
 * starting the server, allowing it to be used in tests.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { sanitizeNoSql } from './shared/middleware/sanitize.js';
import { errorHandler } from './shared/middleware/errorHandler.js';
import { notFoundHandler } from './shared/middleware/notFoundHandler.js';
import apiRouter from './routes/index.js';

const app = express();

// Trust reverse proxy (ALB / NGINX / Cloudflare)
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
}));

// ---------------------------------------------------------------------------
// Body parsing and utilities
// ---------------------------------------------------------------------------
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(compression());

// NoSQL query operator injection protection
app.use(sanitizeNoSql);

// ---------------------------------------------------------------------------
// Request logging
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ---------------------------------------------------------------------------
// Rate limiting — global baseline
// ---------------------------------------------------------------------------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 50000 : 1000,
  skip: (req) =>
    process.env.NODE_ENV === 'development' ||
    req.ip === '127.0.0.1' ||
    req.ip === '::1' ||
    req.ip === '::ffff:127.0.0.1',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api', globalLimiter);

// ---------------------------------------------------------------------------
// Health check — lightweight, no auth required
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'queueless-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use('/api', apiRouter);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

