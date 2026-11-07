import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, 'results');
const CONSOLIDATED_PATH = path.resolve(RESULTS_DIR, 'consolidated-summary.json');

const SCENARIO_DEFS = {
  a: { id: 'A', name: 'Appointment Availability Requests' },
  b: { id: 'B', name: 'Appointment Request Creation' },
  c: { id: 'C', name: 'Queue Status Retrieval' },
  d: { id: 'D', name: 'Patient Check-In' },
  e: { id: 'E', name: 'Walk-In Registration' },
  f: { id: 'F', name: 'Staff Queue Operations' },
  g: { id: 'G', name: 'Realistic Mixed Workload' },
};

function parseK6Summary(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const m = raw.metrics || {};

  const httpReqs = m.http_reqs ? (m.http_reqs.count ?? m.http_reqs.values?.count ?? 0) : 0;
  const httpRate = m.http_reqs ? (m.http_reqs.rate ?? m.http_reqs.values?.rate ?? 0) : 0;
  const duration = m.http_req_duration ? (m.http_req_duration.values || m.http_req_duration) : {};
  const failedRate = m.http_req_failed ? (m.http_req_failed.value ?? m.http_req_failed.values?.rate ?? 0) * 100 : 0;

  return {
    totalRequests: httpReqs,
    rps: parseFloat(httpRate.toFixed(2)),
    avgMs: parseFloat((duration.avg || 0).toFixed(2)),
    minMs: parseFloat((duration.min || 0).toFixed(2)),
    medMs: parseFloat((duration.med || 0).toFixed(2)),
    p90Ms: duration['p(90)'] !== undefined ? parseFloat(duration['p(90)'].toFixed(2)) : null,
    p95Ms: duration['p(95)'] !== undefined ? parseFloat(duration['p(95)'].toFixed(2)) : null,
    p99Ms: duration['p(99)'] !== undefined ? parseFloat(duration['p(99)'].toFixed(2)) : null, // Strict null: k6 default does not compute p99
    maxMs: parseFloat((duration.max || 0).toFixed(2)),
    failureRatePct: parseFloat(failedRate.toFixed(2)),
  };
}

const files = fs.readdirSync(RESULTS_DIR).filter((f) => f.startsWith('summary-') && f.endsWith('.json'));

const results = [];
for (const file of files) {
  const match = file.match(/^summary-([a-g])-(\d+)vus\.json$/);
  if (!match) continue;
  const scKey = match[1];
  const vus = parseInt(match[2], 10);
  const def = SCENARIO_DEFS[scKey];
  const filePath = path.join(RESULTS_DIR, file);
  const metrics = parseK6Summary(filePath);
  if (metrics) {
    results.push({
      scenarioId: def.id,
      scenarioName: def.name,
      vus,
      sourceFile: file,
      ...metrics,
    });
  }
}

// Sort by scenarioId then vus
results.sort((a, b) => {
  if (a.scenarioId !== b.scenarioId) return a.scenarioId.localeCompare(b.scenarioId);
  return a.vus - b.vus;
});

const consolidated = {
  testDate: '2026-11-07T09:15:15.501Z',
  environment: {
    platform: 'win32',
    arch: 'x64',
    nodeVersion: 'v24.18.0',
    database: 'queueless_test (local standalone MongoDB)',
    serverUrl: 'http://127.0.0.1:5005',
  },
  auditNotes: {
    p99ReportingStatus: 'k6 default summaryTrendStats exports [avg, min, med, max, p(90), p(95)]. p(99) was not computed by k6 during runs; reported as null/N/A.',
    scenarioGScope: 'Scenario G halted at 25 VUs by safety load gate (p95 > 5000ms). Stages 50, 100, 250, 500 VUs were not tested.',
    scenarioFScope: 'Scenario F was executed at 10 VUs for clinical mutual exclusion audit.',
  },
  results,
};

fs.writeFileSync(CONSOLIDATED_PATH, JSON.stringify(consolidated, null, 2), 'utf-8');
console.log(`Re-parsed ${results.length} raw benchmark files successfully.`);

