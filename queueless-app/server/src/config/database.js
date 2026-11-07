/**
 * MongoDB Connection & Security Guard
 *
 * Connects Mongoose to MongoDB with production-ready options.
 * Enforces strict fail-closed database isolation during automated testing
 * to ensure tests can NEVER touch development, staging, or production databases.
 */

import dns from 'node:dns';
import mongoose from 'mongoose';
import { logger } from '../shared/logger.js';

export const APPROVED_TEST_DB_NAME = 'queueless_test';
export const APPROVED_TEST_HOSTS = ['127.0.0.1', 'localhost'];

/**
 * Validates that a connection URI strictly adheres to test isolation requirements.
 * Throws a SecurityError if the URI points to anything other than local queueless_test.
 *
 * @param {string} uri - Connection string to validate
 * @returns {boolean} true if valid
 */
export function validateTestDatabaseUri(uri) {
  if (!uri || typeof uri !== 'string' || uri.trim() === '') {
    throw new Error(
      '[SECURITY GUARD] In test mode (NODE_ENV=test), an explicit MONGODB_URI pointing to the dedicated test database must be provided. Fallback to development or default databases is strictly forbidden.'
    );
  }

  // Mask credentials if present for safe reporting in logs/errors
  const sanitizedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');

  // Strict Atlas / SRV rejection
  if (uri.startsWith('mongodb+srv://') || uri.includes('.mongodb.net')) {
    throw new Error(
      `[SECURITY GUARD] Automated tests are strictly prohibited from connecting to MongoDB Atlas or remote clusters! Blocked URI: ${sanitizedUri}`
    );
  }

  // Match standard MongoDB URI: mongodb://[user:pass@]host[:port]/database[?params]
  const match = uri.match(/^mongodb:\/\/(?:([^:]+)(?::([^@]+))?@)?([^/?#]+)(?:\/([^?#]*))?(?:\?(.*))?$/);
  if (!match) {
    throw new Error(
      `[SECURITY GUARD] Malformed MongoDB connection URI provided to automated test runner: ${sanitizedUri}`
    );
  }

  const hostWithPort = match[3];
  const host = hostWithPort.split(':')[0].toLowerCase();
  const dbName = match[4];

  // Host validation
  if (!APPROVED_TEST_HOSTS.includes(host)) {
    throw new Error(
      `[SECURITY GUARD] Automated tests must connect strictly to a local MongoDB instance (${APPROVED_TEST_HOSTS.join(', ')}). Remote host "${host}" is strictly forbidden! Blocked URI: ${sanitizedUri}`
    );
  }

  // Database name validation
  if (!dbName || dbName.trim() === '') {
    throw new Error(
      `[SECURITY GUARD] Automated tests require an explicit database name. Empty database name is forbidden! Blocked URI: ${sanitizedUri}`
    );
  }

  if (dbName !== APPROVED_TEST_DB_NAME) {
    throw new Error(
      `[SECURITY GUARD] Automated tests are restricted exclusively to the "${APPROVED_TEST_DB_NAME}" database. Attempted connection to "${dbName}" is strictly blocked to protect development, staging, and production data!`
    );
  }

  return true;
}

/**
 * Connect to MongoDB.
 * @param {string} [uri] - MongoDB connection string
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDatabase(uri) {
  if (mongoose.connection.readyState === 1) {
    if (process.env.NODE_ENV === 'test' && mongoose.connection.name !== APPROVED_TEST_DB_NAME) {
      throw new Error(
        `[SECURITY GUARD] Existing Mongoose connection is connected to "${mongoose.connection.name}", but automated tests require "${APPROVED_TEST_DB_NAME}"!`
      );
    }
    return mongoose;
  }

  const isTest = process.env.NODE_ENV === 'test';
  let targetUri;

  if (isTest) {
    // In test mode: must have explicit URI (via argument or env var), strictly validated
    targetUri = uri || process.env.MONGODB_URI;
    validateTestDatabaseUri(targetUri);
  } else {
    // Development or production
    targetUri = uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/queueless_dev';
  }

  if (typeof targetUri === 'string' && targetUri.startsWith('mongodb+srv://')) {
    try {
      dns.setServers(['8.8.8.8', '1.1.1.1']);
    } catch (e) {}
  }

  mongoose.connection.on('connected', () => {
    logger.info('Mongoose connected to MongoDB');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('Mongoose connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('Mongoose disconnected from MongoDB');
  });

  return mongoose.connect(targetUri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
}

/**
 * Disconnect from MongoDB — used in tests and graceful shutdown.
 */
export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

// Aliases for convenience
export const connectDB = connectDatabase;
export const disconnectDB = disconnectDatabase;
