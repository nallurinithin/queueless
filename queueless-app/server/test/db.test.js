/**
 * Database Connection Test
 *
 * Verifies that Mongoose connects to the local MongoDB server and executes
 * an admin ping command successfully.
 */

import { describe, it, expect, afterAll } from 'vitest';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/queueless_test?directConnection=true';

describe('Database Connection', () => {
  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('connects to MongoDB and performs ping successfully', async () => {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    expect(mongoose.connection.readyState).toBe(1); // 1 = connected

    const pingResult = await mongoose.connection.db.admin().ping();
    expect(pingResult).toBeDefined();
    expect(pingResult.ok).toBe(1);
  });
});

