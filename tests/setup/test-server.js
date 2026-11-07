/**
 * QueueLess Dedicated Automated Test Server
 *
 * Runs exclusively in test mode (NODE_ENV=test) connected strictly to
 * the local queueless_test database on dedicated PORT 5005.
 * Strictly isolates all testing from development, staging, and production databases.
 */

import { createServer } from 'node:http';
import mongoose from 'mongoose';

// Force test environment variables before any module loads
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.TEST_PORT || '5005';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/queueless_test?directConnection=true';
process.env.SESSION_SECRET = 'test_secret_key_aarogyam_12345678901234567890';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174';
process.env.RAZORPAY_MODE = 'test';
process.env.SMS_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'mock';
process.env.LOG_LEVEL = 'warn'; // Keep logs focused during heavy load

import app from '../../queueless-app/server/src/app.js';
import { connectDatabase, APPROVED_TEST_DB_NAME } from '../../queueless-app/server/src/config/database.js';
import { createSocketServer } from '../../queueless-app/server/src/config/socket.js';
import { logger } from '../../queueless-app/server/src/shared/logger.js';

const PORT = parseInt(process.env.PORT, 10);
const httpServer = createServer(app);
createSocketServer(httpServer);

async function start() {
  try {
    await connectDatabase(process.env.MONGODB_URI);

    // Fail-closed verification
    if (mongoose.connection.name !== APPROVED_TEST_DB_NAME) {
      console.error(`[FATAL SECURITY VIOLATION] Connected to ${mongoose.connection.name} instead of ${APPROVED_TEST_DB_NAME}! Aborting immediately.`);
      process.exit(1);
    }

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ [TEST SERVER ACTIVE] Dedicated test instance running on http://127.0.0.1:${PORT}`);
      console.log(`  Database: ${mongoose.connection.name} (strictly local test DB)`);
      console.log(`  PID: ${process.pid}`);
    });
  } catch (err) {
    console.error('Failed to start test server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  httpServer.close(() => {
    mongoose.disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  httpServer.close(() => {
    mongoose.disconnect();
    process.exit(0);
  });
});

start();

