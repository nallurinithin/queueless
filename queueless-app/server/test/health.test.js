/**
 * Health Check & Boot Test
 *
 * Verifies that the Express application boots properly and responds to
 * the /api/health endpoint with status 200 and expected payload structure.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('Server Health Endpoint', () => {
  it('GET /api/health returns status 200 with ok status and uptime', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('queueless-api');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /api returns 200 with API info', async () => {
    const res = await request(app).get('/api');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('QueueLess API');
    expect(res.body.version).toBe('1.0.0');
  });

  it('GET /api/unhandled returns 404 with standardized error structure', async () => {
    const res = await request(app).get('/api/unhandled');

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
