/**
 * MongoDB Connection
 *
 * Connects Mongoose to MongoDB with production-ready options.
 * Logs connection events and handles disconnection gracefully.
 */

import dns from 'node:dns';
import mongoose from 'mongoose';
import { logger } from '../shared/logger.js';

/**
 * Connect to MongoDB.
 * @param {string} [uri] - MongoDB connection string
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDatabase(uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/queueless_dev') {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (typeof uri === 'string' && uri.startsWith('mongodb+srv://')) {
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

  return mongoose.connect(uri, {
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
