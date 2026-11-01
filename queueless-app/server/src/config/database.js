/**
 * MongoDB Connection
 *
 * Connects Mongoose to MongoDB with production-ready options.
 * Logs connection events and handles disconnection gracefully.
 */

import mongoose from 'mongoose';
import { logger } from '../shared/logger.js';

/**
 * Connect to MongoDB.
 * @param {string} uri - MongoDB connection string
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDatabase(uri) {
  mongoose.connection.on('connected', () => {
    logger.info('Mongoose connected to MongoDB');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('Mongoose connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('Mongoose disconnected from MongoDB');
  });

  return mongoose.connect(uri, {
    // Mongoose 8 uses the new driver defaults; these are explicit for clarity
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
}

/**
 * Disconnect from MongoDB — used in tests and graceful shutdown.
 */
export async function disconnectDatabase() {
  await mongoose.disconnect();
}

