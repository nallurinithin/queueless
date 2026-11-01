/**
 * QueueLess Server — Application Entry Point
 *
 * Loads environment configuration, connects to MongoDB, mounts
 * Express middleware and routes, then starts the HTTP server
 * with Socket.IO attached.
 */

import { createServer } from 'node:http';
import app from './app.js';
import { connectDatabase } from './config/database.js';
import { createSocketServer } from './config/socket.js';
import { validateEnv } from './config/env.js';
import { logger } from './shared/logger.js';

const env = validateEnv();

const PORT = env.PORT;
const httpServer = createServer(app);

// Attach Socket.IO to the HTTP server
createSocketServer(httpServer);

async function start() {
  try {
    await connectDatabase(env.MONGODB_URI);
    logger.info('✓ MongoDB connected');

    httpServer.listen(PORT, () => {
      logger.info(`✓ QueueLess server listening on port ${PORT}`);
      logger.info(`  Environment: ${env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('✗ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`\n${signal} received — shutting down gracefully`);
  httpServer.close(() => {
    logger.info('✓ HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();

