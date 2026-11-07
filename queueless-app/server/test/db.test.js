/**
 * Database Connection & Security Guard Tests
 *
 * Verifies that Mongoose connects strictly to the dedicated `queueless_test` database,
 * performs an admin ping command successfully, and rigorously verifies that the
 * fail-closed security guard blocks development, staging, production, and Atlas databases.
 */

import { describe, it, expect, afterAll } from 'vitest';
import mongoose from 'mongoose';
import {
  connectDatabase,
  disconnectDatabase,
  validateTestDatabaseUri,
  APPROVED_TEST_DB_NAME,
} from '../src/config/database.js';

describe('Database Connection & Test Isolation Security Guard', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  it('connects to dedicated queueless_test database and performs ping successfully', async () => {
    await connectDatabase();

    expect(mongoose.connection.readyState).toBe(1); // 1 = connected
    expect(mongoose.connection.name).toBe(APPROVED_TEST_DB_NAME);
    expect(mongoose.connection.name).toBe('queueless_test');

    const pingResult = await mongoose.connection.db.admin().ping();
    expect(pingResult).toBeDefined();
    expect(pingResult.ok).toBe(1);
  });

  it('strictly rejects missing or empty MONGODB_URI in test mode without falling back to development', () => {
    expect(() => validateTestDatabaseUri(undefined)).toThrow(/\[SECURITY GUARD\].*explicit MONGODB_URI/i);
    expect(() => validateTestDatabaseUri('')).toThrow(/\[SECURITY GUARD\].*explicit MONGODB_URI/i);
    expect(() => validateTestDatabaseUri('   ')).toThrow(/\[SECURITY GUARD\].*explicit MONGODB_URI/i);
  });

  it('strictly rejects local development database (queueless_dev) in test mode', () => {
    expect(() =>
      validateTestDatabaseUri('mongodb://127.0.0.1:27017/queueless_dev')
    ).toThrow(/\[SECURITY GUARD\].*restricted exclusively to the "queueless_test" database.*Attempted connection to "queueless_dev"/i);

    expect(() =>
      validateTestDatabaseUri('mongodb://localhost:27017/queueless_dev?directConnection=true')
    ).toThrow(/\[SECURITY GUARD\].*restricted exclusively to the "queueless_test" database.*Attempted connection to "queueless_dev"/i);
  });

  it('strictly rejects MongoDB Atlas and SRV URIs in test mode', () => {
    expect(() =>
      validateTestDatabaseUri('mongodb+srv://admin:secret123@cluster0.abc.mongodb.net/queueless_test?retryWrites=true')
    ).toThrow(/\[SECURITY GUARD\].*strictly prohibited from connecting to MongoDB Atlas/i);

    expect(() =>
      validateTestDatabaseUri('mongodb://cluster0.abc.mongodb.net:27017/queueless_test')
    ).toThrow(/\[SECURITY GUARD\].*strictly prohibited from connecting to MongoDB Atlas or remote clusters/i);
  });

  it('strictly rejects non-local hosts, production database names, and malformed URIs in test mode', () => {
    // Non-local host
    expect(() =>
      validateTestDatabaseUri('mongodb://192.168.1.100:27017/queueless_test')
    ).toThrow(/\[SECURITY GUARD\].*Remote host "192.168.1.100" is strictly forbidden/i);

    expect(() =>
      validateTestDatabaseUri('mongodb://staging-server.internal:27017/queueless_test')
    ).toThrow(/\[SECURITY GUARD\].*Remote host "staging-server.internal" is strictly forbidden/i);

    // Production database name
    expect(() =>
      validateTestDatabaseUri('mongodb://127.0.0.1:27017/queueless_prod')
    ).toThrow(/\[SECURITY GUARD\].*Attempted connection to "queueless_prod" is strictly blocked/i);

    // Staging database name
    expect(() =>
      validateTestDatabaseUri('mongodb://127.0.0.1:27017/queueless_staging')
    ).toThrow(/\[SECURITY GUARD\].*Attempted connection to "queueless_staging" is strictly blocked/i);

    // Empty database name
    expect(() =>
      validateTestDatabaseUri('mongodb://127.0.0.1:27017/')
    ).toThrow(/\[SECURITY GUARD\].*Empty database name is forbidden/i);
  });
});

